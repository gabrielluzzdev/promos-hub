import type { Store } from "@/lib/products/stores";
import type { RuleConfig } from "@/lib/rules/config";
import type { Badge, PriceStats, RuleResult } from "@/lib/rules/evaluate";

export interface RawInputRow {
  id: string;
  source: "manual_text" | "manual_form" | "feed";
  raw_text: string | null;
  status: "pending" | "parsed" | "failed";
  attempts: number;
}

export interface NewOffer {
  raw_input_id: string | null;
  product_id: string;
  category_id: string | null;
  price_cents: number | null;
  claimed_before_cents: number | null;
  coupon: string | null;
  conditions: string | null;
  post_title: string;
  post_condition: string | null;
  source_url: string | null;
  affiliate_url: string | null;
  flags: string[];
  possible_duplicate_of: string | null;
}

export interface OfferForRules {
  id: string;
  status: string;
  price_cents: number | null;
  flags: string[];
  created_at: Date;
  product_id: string;
  store: Store;
}

/** Acesso a dados da entrada de ofertas. Produção: Supabase (service role). Testes: memória. */
export interface IntakeRepo {
  getRawInput(id: string): Promise<RawInputRow | null>;
  updateRawInput(
    id: string,
    patch: Partial<{ status: RawInputRow["status"]; attempts: number; error: string | null; parser_output: unknown }>,
  ): Promise<void>;
  categoryIdsBySlug(): Promise<Map<string, string>>;
  /** Cria se não existir; `created` diz se é novo. */
  upsertProduct(p: {
    store: Store;
    canonical_key: string;
    name: string;
    brand: string | null;
    model: string | null;
    canonical_url: string | null;
  }): Promise<{ id: string; created: boolean }>;
  findSimilarProduct(store: Store, key: string): Promise<string | null>;
  insertOffer(offer: NewOffer): Promise<{ id: string }>;
  insertPrice(productId: string, cents: number, source: "manual" | "parser" | "feed" | "monitor"): Promise<void>;
  getOfferForRules(offerId: string): Promise<OfferForRules | null>;
  priceStats(productId: string, before: Date): Promise<PriceStats>;
  lastApprovedAt(productId: string, excludeOfferId: string): Promise<Date | null>;
  ruleConfig(): Promise<RuleConfig>;
  saveEvaluation(
    offerId: string,
    result: { status: "rejected_auto" | "pending_review"; rule_results: RuleResult[]; badge: Badge; discount_vs_avg_pct: number | null },
  ): Promise<void>;
}
