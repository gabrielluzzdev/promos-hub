import { beforeEach, describe, expect, it } from "vitest";
import type { IntakeRepo, NewOffer, RawInputRow } from "@/lib/intake/repo";
import { createOffer, processRawInput, resolveStore } from "@/lib/intake/pipeline";
import { buildUserMessage, toCents, type GenerateFn } from "@/lib/parser";
import type { ParserOutput } from "@/lib/parser/schema";
import type { RuleConfig } from "@/lib/rules/config";
import type { PriceStats } from "@/lib/rules/evaluate";

const CONFIG: RuleConfig = {
  min_discount_pct: 15,
  dup_block_days: 7,
  allowed_stores: ["amazon", "mercadolivre", "shopee", "magalu", "kabum", "casasbahia", "americanas"],
  silence: { start: "23:00", end: "08:00" },
  offer_ttl_hours: 24,
  badge_min_history_days: 30,
  badge_min_price_points: 5,
};

class MemoryIntakeRepo implements IntakeRepo {
  raw = new Map<string, RawInputRow & { error?: string | null; parser_output?: unknown }>();
  products: { id: string; store: string; canonical_key: string; name: string }[] = [];
  prices: { product_id: string; cents: number; source: string; seen_at: Date }[] = [];
  offers: (NewOffer & { id: string; status: string; created_at: Date; rule_results?: unknown; badge?: string })[] = [];
  private seq = 0;
  clock = new Date("2026-11-07T15:00:00Z");

  async getRawInput(id: string) {
    return this.raw.get(id) ?? null;
  }
  async updateRawInput(id: string, patch: Parameters<IntakeRepo["updateRawInput"]>[1]) {
    Object.assign(this.raw.get(id)!, patch);
  }
  async categoryIdsBySlug() {
    return new Map([["tecnologia", "cat-tec"], ["games", "cat-games"]]);
  }
  async upsertProduct(p: Parameters<IntakeRepo["upsertProduct"]>[0]) {
    const found = this.products.find((x) => x.store === p.store && x.canonical_key === p.canonical_key);
    if (found) return { id: found.id, created: false };
    const id = `p${++this.seq}`;
    this.products.push({ id, store: p.store, canonical_key: p.canonical_key, name: p.name });
    return { id, created: true };
  }
  async findSimilarProduct() {
    return null;
  }
  async insertOffer(o: NewOffer) {
    const id = `o${++this.seq}`;
    this.offers.push({ ...o, id, status: "pending_rules", created_at: new Date(this.clock) });
    return { id };
  }
  async insertPrice(product_id: string, cents: number, source: string) {
    this.prices.push({ product_id, cents, source, seen_at: new Date(this.clock.getTime() + 1) });
  }
  async getOfferForRules(id: string) {
    const o = this.offers.find((x) => x.id === id)!;
    const store = this.products.find((p) => p.id === o.product_id)!.store as "amazon";
    return { id, status: o.status, price_cents: o.price_cents, flags: o.flags, created_at: o.created_at, product_id: o.product_id, store };
  }
  async priceStats(productId: string, before: Date): Promise<PriceStats> {
    const rows = this.prices.filter((p) => p.product_id === productId && p.seen_at < before);
    if (!rows.length) return { min_90d: null, avg_90d: null, points: 0, first_seen: null };
    return {
      min_90d: Math.min(...rows.map((r) => r.cents)),
      avg_90d: rows.reduce((s, r) => s + r.cents, 0) / rows.length,
      points: rows.length,
      first_seen: new Date(Math.min(...rows.map((r) => r.seen_at.getTime()))),
    };
  }
  async lastApprovedAt() {
    return null;
  }
  async ruleConfig() {
    return CONFIG;
  }
  async saveEvaluation(id: string, r: Parameters<IntakeRepo["saveEvaluation"]>[1]) {
    Object.assign(this.offers.find((x) => x.id === id)!, r);
  }
}

const DEAL_TEXT = `🔥 CORRE!! Monitor LG UltraGear 27" 144Hz IPS
de R$ 1.499 por R$ 1.099,90 à vista
👉 https://www.amazon.com.br/dp/B0CHX3QBCH?ref=grupo

🎮 Controle DualSense Branco
R$ 349 com cupom JOGA20 no app
https://produto.mercadolivre.com.br/MLB-3456789012-controle`;

const PARSED: ParserOutput = {
  offers: [
    {
      store: "amazon",
      product_name: "Monitor LG UltraGear 27\" 144Hz IPS",
      brand: "LG",
      model: "UltraGear 27GN750",
      url: "https://www.amazon.com.br/dp/B0CHX3QBCH?ref=grupo",
      price_current: 1099.9,
      price_claimed_before: 1499,
      coupon: null,
      conditions: null,
      category_slug: "tecnologia",
      post_title: "Monitor LG UltraGear 27\" 144Hz",
      post_condition: null,
      flags: [],
    },
    {
      store: "mercadolivre",
      product_name: "Controle DualSense Branco",
      brand: "Sony",
      model: "DualSense",
      url: "https://produto.mercadolivre.com.br/MLB-3456789012-controle",
      price_current: 349,
      price_claimed_before: null,
      coupon: "JOGA20",
      conditions: "Só no app",
      category_slug: "games",
      post_title: "Controle DualSense Branco",
      post_condition: "Cupom JOGA20, só no app",
      flags: [],
    },
  ],
};

let repo: MemoryIntakeRepo;
const deps = (generate: GenerateFn) => ({
  repo,
  affiliate: { amazonAssociateTag: "nossa-20" },
  now: () => new Date("2026-11-07T15:05:00Z"),
  generate,
  systemPrompt: async () => "system",
});

beforeEach(() => {
  repo = new MemoryIntakeRepo();
  repo.raw.set("r1", { id: "r1", source: "manual_text", raw_text: DEAL_TEXT, status: "pending", attempts: 0 });
});

describe("pipeline de entrada", () => {
  it("texto real vira ofertas, produtos e preços certos", async () => {
    let prompt = "";
    const result = await processRawInput("r1", deps(async (input) => {
      prompt = input.prompt;
      return PARSED;
    }));

    expect(result).toEqual({ status: "parsed", offers: 2 });
    expect(prompt).toBe(buildUserMessage("manual_text", DEAL_TEXT));
    expect(repo.raw.get("r1")).toMatchObject({ status: "parsed", attempts: 1, error: null });

    expect(repo.products.map((p) => [p.store, p.canonical_key])).toEqual([
      ["amazon", "B0CHX3QBCH"],
      ["mercadolivre", "MLB3456789012"],
    ]);
    // Só o preço atual vai para o histórico; o "de" nunca.
    expect(repo.prices.map((p) => [p.cents, p.source])).toEqual([
      [109990, "parser"],
      [34900, "parser"],
    ]);

    const [monitor, controle] = repo.offers;
    expect(monitor).toMatchObject({
      category_id: "cat-tec",
      price_cents: 109990,
      claimed_before_cents: 149900,
      affiliate_url: "https://www.amazon.com.br/dp/B0CHX3QBCH?ref=grupo&tag=nossa-20",
      status: "pending_review",
      badge: "none",
    });
    expect(controle).toMatchObject({
      category_id: "cat-games",
      coupon: "JOGA20",
      post_condition: "Cupom JOGA20, só no app",
      affiliate_url: null, // Mercado Livre: revisor cola o link
      status: "pending_review",
    });
  });

  it("falha do parser repete uma vez e então marca failed para entrada manual", async () => {
    let calls = 0;
    const result = await processRawInput("r1", deps(async () => {
      calls++;
      throw new Error("timeout do modelo");
    }));
    expect(calls).toBe(2);
    expect(result.status).toBe("failed");
    expect(repo.raw.get("r1")).toMatchObject({ status: "failed", attempts: 1, error: "timeout do modelo" });
    expect(repo.offers).toHaveLength(0);
  });

  it("saída fora do schema conta como erro", async () => {
    const result = await processRawInput("r1", deps(async () => ({ offers: [{ store: "x" }] }) as unknown as ParserOutput));
    expect(result.status).toBe("failed");
  });

  it("no máximo 10 ofertas por texto", async () => {
    const many = { offers: Array.from({ length: 12 }, (_, i) => ({ ...PARSED.offers[0]!, url: `https://www.amazon.com.br/dp/B0CHX3QB${String(i).padStart(2, "0")}` })) };
    const result = await processRawInput("r1", deps(async () => many));
    expect(result.offers).toBe(10);
    expect(repo.offers).toHaveLength(10);
  });

  it("oferta sem preço ganha a flag e fica em revisão", async () => {
    const noPrice = { offers: [{ ...PARSED.offers[0]!, price_current: null }] };
    await processRawInput("r1", deps(async () => noPrice));
    expect(repo.offers[0]!.flags).toContain("missing_price");
    expect(repo.offers[0]!.status).toBe("pending_review");
    expect(repo.prices).toHaveLength(0);
  });

  it("loja desconhecida é rejeitada automaticamente", async () => {
    const id = await createOffer(
      {
        rawInputId: null,
        store: "other",
        name: "Fone",
        brand: null,
        model: null,
        url: "https://loja-x.com/fone",
        priceCents: 5000,
        claimedBeforeCents: null,
        coupon: null,
        conditions: null,
        categoryId: null,
        postTitle: "Fone",
        postCondition: null,
        flags: [],
        priceSource: "manual",
      },
      deps(async () => PARSED),
    );
    expect(repo.offers.find((o) => o.id === id)!.status).toBe("rejected_auto");
  });

  it("a loja do link prevalece sobre o palpite do parser", () => {
    expect(resolveStore("shopee", "https://www.amazon.com.br/dp/B0CHX3QBCH")).toBe("amazon");
    expect(resolveStore("amazon", null)).toBe("amazon");
    expect(resolveStore("other", "https://loja-x.com")).toBe("other");
  });

  it("toCents", () => {
    expect(toCents(1099.9)).toBe(109990);
    expect(toCents(0)).toBeNull();
    expect(toCents(null)).toBeNull();
  });
});
