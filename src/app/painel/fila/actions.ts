"use server";

import { revalidatePath } from "next/cache";
import { audit, requireOperator } from "@/lib/auth/server";
import { intakeDeps } from "@/lib/intake/deps";
import { runRules } from "@/lib/intake/pipeline";
import { ensureLink } from "@/lib/panel/links";
import type { ActionResult } from "@/lib/panel/types";
import { ruleConfigFromRows } from "@/lib/rules/config";

function validUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function approveOffer(
  offerId: string,
  input: { affiliateUrl: string; sendToGeneral: boolean },
): Promise<ActionResult> {
  const operator = await requireOperator();
  const { db } = operator;

  const affiliateUrl = validUrl(input.affiliateUrl);
  if (!affiliateUrl) return { ok: false, error: "Cole o link de afiliado (https://…) antes de aprovar." };

  const { data: offer, error } = await db
    .from("offers")
    .select("id, status, price_cents, category_id")
    .eq("id", offerId)
    .single<{ id: string; status: string; price_cents: number | null; category_id: string | null }>();
  if (error || !offer) return { ok: false, error: "Oferta não encontrada." };
  if (offer.status !== "pending_review") return { ok: false, error: "Esta oferta já foi decidida." };
  if (!offer.price_cents) return { ok: false, error: "Preencha o preço (E para editar) antes de aprovar." };
  if (!offer.category_id) return { ok: false, error: "Escolha a categoria (E para editar) antes de aprovar." };

  const { data: configRows } = await db.from("rule_config").select("key, value");
  const config = ruleConfigFromRows(configRows ?? []);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.offer_ttl_hours * 60 * 60 * 1000);

  const { data: updated, error: updateError } = await db
    .from("offers")
    .update({
      status: "approved",
      affiliate_url: affiliateUrl,
      send_to_general: input.sendToGeneral,
      reviewed_by: operator.id,
      reviewed_at: now.toISOString(),
      approved_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", offerId)
    .eq("status", "pending_review")
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated?.length) return { ok: false, error: "Outro operador decidiu esta oferta antes." };

  await ensureLink(db, { offerId, categoryId: offer.category_id, destination: affiliateUrl });
  if (input.sendToGeneral) {
    const { data: general } = await db.from("categories").select("id").eq("slug", "geral").single<{ id: string }>();
    if (general) await ensureLink(db, { offerId, categoryId: general.id, destination: affiliateUrl });
  }

  await audit(operator, "approve", "offer", offerId, { send_to_general: input.sendToGeneral });
  revalidatePath("/painel/fila");
  revalidatePath("/painel/publicar");
  return { ok: true };
}

export async function rejectOffer(offerId: string, reason: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const text = reason.trim();
  if (!text) return { ok: false, error: "Informe o motivo da rejeição." };

  const { data, error } = await operator.db
    .from("offers")
    .update({
      status: "rejected",
      reject_reason: text.slice(0, 200),
      reviewed_by: operator.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .eq("status", "pending_review")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Esta oferta já foi decidida." };

  await audit(operator, "reject", "offer", offerId, { reason: text });
  revalidatePath("/painel/fila");
  return { ok: true };
}

export interface OfferEdit {
  postTitle: string;
  postCondition: string;
  priceReais: string;
  categoryId: string;
  affiliateUrl: string;
}

/** "1.099,90" ou "1099.90" -> 109990. */
function parseReais(value: string): number | null {
  const cleaned = value.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
}

export async function editOffer(offerId: string, edit: OfferEdit): Promise<ActionResult> {
  const operator = await requireOperator();
  const { db } = operator;
  const title = edit.postTitle.trim();
  if (!title) return { ok: false, error: "O título não pode ficar vazio." };
  const priceCents = parseReais(edit.priceReais);
  if (edit.priceReais.trim() && priceCents === null) return { ok: false, error: "Preço inválido." };

  const { data: current, error } = await db
    .from("offers")
    .select("id, status, price_cents, product_id")
    .eq("id", offerId)
    .single<{ id: string; status: string; price_cents: number | null; product_id: string }>();
  if (error || !current) return { ok: false, error: "Oferta não encontrada." };
  if (current.status !== "pending_review") return { ok: false, error: "Só dá para editar ofertas em revisão." };

  const patch = {
    post_title: title.slice(0, 80),
    post_condition: edit.postCondition.trim() || null,
    price_cents: priceCents,
    category_id: edit.categoryId || null,
    affiliate_url: validUrl(edit.affiliateUrl),
  };
  const { error: updateError } = await db.from("offers").update(patch).eq("id", offerId);
  if (updateError) return { ok: false, error: updateError.message };

  // Preço novo preenchido pelo revisor entra no histórico como manual.
  if (priceCents !== null && priceCents !== current.price_cents) {
    await db.from("prices").insert({ product_id: current.product_id, price_cents: priceCents, source: "manual" });
  }

  await runRules(offerId, intakeDeps());
  await audit(operator, "edit", "offer", offerId, patch);
  revalidatePath("/painel/fila");

  const { data: after } = await db.from("offers").select("status").eq("id", offerId).single<{ status: string }>();
  if (after?.status === "rejected_auto") {
    return { ok: true, message: "Com os novos dados, as regras rejeitaram a oferta." };
  }
  return { ok: true };
}

export async function discardFailedInput(rawInputId: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const { error } = await operator.db
    .from("raw_inputs")
    .update({ status: "parsed", error: "descartado manualmente" })
    .eq("id", rawInputId)
    .eq("status", "failed");
  if (error) return { ok: false, error: error.message };
  await audit(operator, "discard", "raw_input", rawInputId);
  revalidatePath("/painel/fila");
  return { ok: true };
}
