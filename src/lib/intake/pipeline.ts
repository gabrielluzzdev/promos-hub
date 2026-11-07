import { buildAffiliateUrl, type AffiliateEnv } from "@/lib/affiliate";
import { parseOffers, toCents, type GenerateFn } from "@/lib/parser";
import type { ParsedOffer } from "@/lib/parser/schema";
import { canonicalKey, canonicalUrl } from "@/lib/products/canonical";
import { storeFromUrl, type Store } from "@/lib/products/stores";
import { evaluateOffer } from "@/lib/rules/evaluate";
import type { IntakeRepo } from "./repo";

export interface IntakeDeps {
  repo: IntakeRepo;
  affiliate: AffiliateEnv;
  now: () => Date;
}

export interface OfferDraft {
  rawInputId: string | null;
  store: Store;
  name: string;
  brand: string | null;
  model: string | null;
  url: string | null;
  priceCents: number | null;
  claimedBeforeCents: number | null;
  coupon: string | null;
  conditions: string | null;
  categoryId: string | null;
  postTitle: string;
  postCondition: string | null;
  flags: string[];
  priceSource: "manual" | "parser";
}

/** A loja pelo link vale mais que a palpite do parser, exceto quando o link é de loja desconhecida. */
export function resolveStore(parsed: Store, url: string | null): Store {
  const fromUrl = storeFromUrl(url);
  if (fromUrl && fromUrl !== "other") return fromUrl;
  if (fromUrl === "other" && parsed === "other") return "other";
  return parsed;
}

export function draftFromParsed(parsed: ParsedOffer, rawInputId: string, categoryIds: Map<string, string>): OfferDraft {
  const priceCents = toCents(parsed.price_current);
  const flags = new Set<string>(parsed.flags);
  if (priceCents === null) flags.add("missing_price");
  return {
    rawInputId,
    store: resolveStore(parsed.store, parsed.url),
    name: parsed.product_name.trim(),
    brand: parsed.brand?.trim() || null,
    model: parsed.model?.trim() || null,
    url: parsed.url?.trim() || null,
    priceCents,
    claimedBeforeCents: toCents(parsed.price_claimed_before),
    coupon: parsed.coupon?.trim() || null,
    conditions: parsed.conditions?.trim() || null,
    categoryId: parsed.category_slug ? (categoryIds.get(parsed.category_slug) ?? null) : null,
    postTitle: (parsed.post_title.trim() || parsed.product_name.trim()).slice(0, 80),
    postCondition: parsed.post_condition?.trim() || null,
    flags: [...flags],
    priceSource: "parser",
  };
}

/** Cria produto (ou reaproveita), oferta e preço; depois roda as regras. */
export async function createOffer(draft: OfferDraft, deps: IntakeDeps): Promise<string> {
  const { repo } = deps;
  const key = canonicalKey({ store: draft.store, url: draft.url, name: draft.name, brand: draft.brand, model: draft.model });
  const product = await repo.upsertProduct({
    store: draft.store,
    canonical_key: key,
    name: draft.name,
    brand: draft.brand,
    model: draft.model,
    canonical_url: canonicalUrl(draft.url),
  });
  // Produto novo com chave parecida na mesma loja: o revisor decide, não juntamos sozinhos.
  const possibleDuplicate = product.created ? await repo.findSimilarProduct(draft.store, key) : null;

  const { id } = await repo.insertOffer({
    raw_input_id: draft.rawInputId,
    product_id: product.id,
    category_id: draft.categoryId,
    price_cents: draft.priceCents,
    claimed_before_cents: draft.claimedBeforeCents,
    coupon: draft.coupon,
    conditions: draft.conditions,
    post_title: draft.postTitle,
    post_condition: draft.postCondition,
    source_url: draft.url,
    affiliate_url: buildAffiliateUrl(draft.store, draft.url, deps.affiliate),
    flags: draft.flags,
    possible_duplicate_of: possibleDuplicate,
  });

  // Só o preço atual entra no histórico. O preço "de" da loja nunca.
  if (draft.priceCents !== null) await repo.insertPrice(product.id, draft.priceCents, draft.priceSource);

  await runRules(id, deps);
  return id;
}

/** Avalia (ou reavalia, depois de uma edição) uma oferta ainda não decidida. */
export async function runRules(offerId: string, deps: IntakeDeps): Promise<void> {
  const { repo } = deps;
  const offer = await repo.getOfferForRules(offerId);
  if (!offer) throw new Error(`oferta ${offerId} não encontrada`);
  if (!["pending_rules", "pending_review", "rejected_auto"].includes(offer.status)) return;

  const [stats, lastApproved, config] = await Promise.all([
    // O histórico para antes da criação da oferta: o preço dela não conta contra ela mesma.
    repo.priceStats(offer.product_id, offer.created_at),
    repo.lastApprovedAt(offer.product_id, offer.id),
    repo.ruleConfig(),
  ]);
  const result = evaluateOffer(
    { price_cents: offer.price_cents, flags: offer.flags, last_same_product_approved_at: lastApproved },
    { store: offer.store },
    stats,
    config,
    deps.now(),
  );
  await repo.saveEvaluation(offer.id, {
    status: result.status,
    rule_results: result.results,
    badge: result.badge,
    discount_vs_avg_pct: result.discount_vs_avg_pct,
  });
}

/** Texto colado: parser (com uma repetição) e uma oferta por produto encontrado. */
export async function processRawInput(
  rawInputId: string,
  deps: IntakeDeps & { generate: GenerateFn; systemPrompt: () => Promise<string> },
): Promise<{ status: "parsed" | "failed" | "skipped"; offers: number }> {
  const { repo } = deps;
  const raw = await repo.getRawInput(rawInputId);
  if (!raw || raw.status === "parsed" || !raw.raw_text) return { status: "skipped", offers: 0 };

  const attempts = raw.attempts + 1;
  let parsed: ParsedOffer[];
  try {
    parsed = await parseOffers({
      text: raw.raw_text,
      source: raw.source,
      system: await deps.systemPrompt(),
      generate: deps.generate,
    });
  } catch (error) {
    await repo.updateRawInput(rawInputId, {
      status: "failed",
      attempts,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
    return { status: "failed", offers: 0 };
  }

  await repo.updateRawInput(rawInputId, { status: "parsed", attempts, error: null, parser_output: { offers: parsed } });
  const categoryIds = await repo.categoryIdsBySlug();
  for (const offer of parsed) {
    await createOffer(draftFromParsed(offer, rawInputId, categoryIds), deps);
  }
  return { status: "parsed", offers: parsed.length };
}
