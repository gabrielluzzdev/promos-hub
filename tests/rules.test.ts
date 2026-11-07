import { describe, expect, it } from "vitest";
import type { RuleConfig } from "@/lib/rules/config";
import { evaluateOffer, type OfferInput, type PriceStats, type ProductInput } from "@/lib/rules/evaluate";
import { isSilent } from "@/lib/rules/silence";

const config: RuleConfig = {
  min_discount_pct: 15,
  dup_block_days: 7,
  allowed_stores: ["amazon", "mercadolivre", "shopee", "magalu", "kabum", "casasbahia", "americanas"],
  silence: { start: "23:00", end: "08:00" },
  offer_ttl_hours: 24,
  badge_min_history_days: 30,
  badge_min_price_points: 5,
};

const NOW = new Date("2026-11-07T15:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

const offer = (o: Partial<OfferInput> = {}): OfferInput => ({
  price_cents: 85000,
  flags: [],
  last_same_product_approved_at: null,
  ...o,
});
const product = (p: Partial<ProductInput> = {}): ProductInput => ({ store: "amazon", ...p });
/** Histórico suficiente: média R$ 1.000, mínimo R$ 900, 10 pontos, 60 dias. */
const stats = (s: Partial<PriceStats> = {}): PriceStats => ({
  min_90d: 90000,
  avg_90d: 100000,
  points: 10,
  first_seen: daysAgo(60),
  ...s,
});

const outcome = (results: { rule: string; outcome: string }[], rule: string) =>
  results.find((r) => r.rule === rule)?.outcome;

describe("evaluateOffer", () => {
  it.each<[string, Partial<OfferInput>, Partial<ProductInput>, Partial<PriceStats>, "rejected_auto" | "pending_review", string, string]>([
    ["loja permitida", {}, {}, {}, "pending_review", "store_allowed", "pass"],
    ["loja fora da lista", {}, { store: "other" }, {}, "rejected_auto", "store_allowed", "fail"],
    ["possível golpe", { flags: ["possible_scam"] }, {}, {}, "rejected_auto", "possible_scam", "fail"],
    ["sem preço vai para revisão com aviso", { price_cents: null }, {}, {}, "pending_review", "price_present", "warn"],
    ["duplicata há 3 dias", { last_same_product_approved_at: daysAgo(3) }, {}, {}, "rejected_auto", "duplicate", "fail"],
    ["duplicata há exatamente 7 dias passa", { last_same_product_approved_at: daysAgo(7) }, {}, {}, "pending_review", "duplicate", "pass"],
    ["duplicata há 6,9 dias bloqueia", { last_same_product_approved_at: daysAgo(6.9) }, {}, {}, "rejected_auto", "duplicate", "fail"],
    ["histórico com poucos pontos só avisa", {}, {}, { points: 4 }, "pending_review", "history_sufficient", "warn"],
    ["histórico curto em dias só avisa", {}, {}, { first_seen: daysAgo(29) }, "pending_review", "history_sufficient", "warn"],
    ["histórico vazio só avisa", {}, {}, { points: 0, avg_90d: null, min_90d: null, first_seen: null }, "pending_review", "history_sufficient", "warn"],
    ["desconto real de 15% exatos passa", { price_cents: 85000 }, {}, {}, "pending_review", "real_discount", "pass"],
    ["desconto de 14,9% é rejeitado", { price_cents: 85100 }, {}, {}, "rejected_auto", "real_discount", "fail"],
    ["preço acima da média é rejeitado", { price_cents: 110000 }, {}, {}, "rejected_auto", "real_discount", "fail"],
  ])("%s", (_name, o, p, s, status, rule, expected) => {
    const result = evaluateOffer(offer(o), product(p), stats(s), config, NOW);
    expect(result.status).toBe(status);
    expect(outcome(result.results, rule)).toBe(expected);
  });

  it("sem histórico suficiente não aplica a regra de desconto nem dá selo", () => {
    const result = evaluateOffer(offer({ price_cents: 99000 }), product(), stats({ points: 2 }), config, NOW);
    expect(outcome(result.results, "real_discount")).toBeUndefined();
    expect(result.badge).toBe("none");
    expect(result.discount_vs_avg_pct).toBeNull();
  });

  it("selo lowest_90d quando o preço é menor ou igual ao mínimo de 90 dias", () => {
    expect(evaluateOffer(offer({ price_cents: 85000 }), product(), stats({ min_90d: 85000 }), config, NOW).badge).toBe("lowest_90d");
    expect(evaluateOffer(offer({ price_cents: 80000 }), product(), stats(), config, NOW).badge).toBe("lowest_90d");
  });

  it("selo below_avg quando tem desconto mínimo mas não é o menor preço", () => {
    const result = evaluateOffer(offer({ price_cents: 85000 }), product(), stats({ min_90d: 82000 }), config, NOW);
    expect(result.badge).toBe("below_avg");
    expect(result.discount_vs_avg_pct).toBe(15);
  });

  it("todas as regras com motivo em português", () => {
    const result = evaluateOffer(offer(), product(), stats(), config, NOW);
    expect(result.results.map((r) => r.rule)).toEqual([
      "store_allowed",
      "possible_scam",
      "price_present",
      "duplicate",
      "history_sufficient",
      "real_discount",
    ]);
    expect(result.results.every((r) => r.reason_ptbr.length > 0)).toBe(true);
  });
});

describe("isSilent (São Paulo, UTC-3)", () => {
  const silence = { start: "23:00", end: "08:00" };
  const at = (utc: string) => new Date(utc);

  it.each([
    ["22:59 local não é silêncio", "2026-11-08T01:59:00Z", false],
    ["23:00 local começa o silêncio", "2026-11-08T02:00:00Z", true],
    ["00:30 local (depois da meia-noite) é silêncio", "2026-11-08T03:30:00Z", true],
    ["07:59 local ainda é silêncio", "2026-11-08T10:59:00Z", true],
    ["08:00 local acaba o silêncio", "2026-11-08T11:00:00Z", false],
    ["meio-dia local não é silêncio", "2026-11-08T15:00:00Z", false],
  ])("%s", (_name, utc, expected) => {
    expect(isSilent(at(utc), silence)).toBe(expected);
  });

  it("janela no mesmo dia (sem cruzar meia-noite)", () => {
    const lunch = { start: "12:00", end: "13:00" };
    expect(isSilent(at("2026-11-08T15:30:00Z"), lunch)).toBe(true);
    expect(isSilent(at("2026-11-08T16:00:00Z"), lunch)).toBe(false);
  });

  it("início igual ao fim desliga o silêncio", () => {
    expect(isSilent(at("2026-11-08T03:00:00Z"), { start: "00:00", end: "00:00" })).toBe(false);
  });
});
