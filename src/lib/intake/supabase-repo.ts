import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ruleConfigFromRows } from "@/lib/rules/config";
import type { PriceStats } from "@/lib/rules/evaluate";
import type { IntakeRepo, NewOffer, OfferForRules, RawInputRow } from "./repo";

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** IntakeRepo sobre o Supabase. Usado com a service role (pipeline e jobs). */
export class SupabaseIntakeRepo implements IntakeRepo {
  constructor(private readonly db: SupabaseClient) {}

  async getRawInput(id: string): Promise<RawInputRow | null> {
    return check(
      await this.db.from("raw_inputs").select("id, source, raw_text, status, attempts").eq("id", id).maybeSingle<RawInputRow>(),
      "getRawInput",
    );
  }

  async updateRawInput(id: string, patch: Parameters<IntakeRepo["updateRawInput"]>[1]): Promise<void> {
    check(await this.db.from("raw_inputs").update(patch).eq("id", id), "updateRawInput");
  }

  async categoryIdsBySlug(): Promise<Map<string, string>> {
    const rows = check(await this.db.from("categories").select("id, slug"), "categories") as { id: string; slug: string }[];
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  async upsertProduct(p: Parameters<IntakeRepo["upsertProduct"]>[0]): Promise<{ id: string; created: boolean }> {
    const inserted = check(
      await this.db
        .from("products")
        .upsert(p, { onConflict: "store,canonical_key", ignoreDuplicates: true })
        .select("id"),
      "upsertProduct",
    ) as { id: string }[] | null;
    if (inserted && inserted[0]) return { id: inserted[0].id, created: true };
    const existing = check(
      await this.db
        .from("products")
        .select("id")
        .eq("store", p.store)
        .eq("canonical_key", p.canonical_key)
        .single<{ id: string }>(),
      "findProduct",
    );
    return { id: existing.id, created: false };
  }

  async findSimilarProduct(store: string, key: string): Promise<string | null> {
    const id = check(await this.db.rpc("find_similar_product", { p_store: store, p_key: key }), "findSimilar") as
      | string
      | null;
    return id ?? null;
  }

  async insertOffer(offer: NewOffer): Promise<{ id: string }> {
    return check(await this.db.from("offers").insert(offer).select("id").single<{ id: string }>(), "insertOffer");
  }

  async insertPrice(productId: string, cents: number, source: string): Promise<void> {
    check(await this.db.from("prices").insert({ product_id: productId, price_cents: cents, source }), "insertPrice");
  }

  async getOfferForRules(offerId: string): Promise<OfferForRules | null> {
    const row = check(
      await this.db
        .from("offers")
        .select("id, status, price_cents, flags, created_at, product_id, products!offers_product_id_fkey(store)")
        .eq("id", offerId)
        .maybeSingle(),
      "getOfferForRules",
    ) as {
      id: string;
      status: string;
      price_cents: number | null;
      flags: string[];
      created_at: string;
      product_id: string;
      products: { store: OfferForRules["store"] } | null;
    } | null;
    if (!row || !row.products) return null;
    return {
      id: row.id,
      status: row.status,
      price_cents: row.price_cents,
      flags: row.flags,
      created_at: new Date(row.created_at),
      product_id: row.product_id,
      store: row.products.store,
    };
  }

  async priceStats(productId: string, before: Date): Promise<PriceStats> {
    const rows = check(
      await this.db.rpc("price_stats", { p_product_id: productId, p_before: before.toISOString() }),
      "priceStats",
    ) as { min_90d: number | null; avg_90d: number | string | null; points: number; first_seen: string | null }[];
    const row = rows[0];
    return {
      min_90d: row?.min_90d ?? null,
      avg_90d: row?.avg_90d === null || row?.avg_90d === undefined ? null : Number(row.avg_90d),
      points: row?.points ?? 0,
      first_seen: row?.first_seen ? new Date(row.first_seen) : null,
    };
  }

  async lastApprovedAt(productId: string, excludeOfferId: string): Promise<Date | null> {
    const value = check(
      await this.db.rpc("last_approved_at", { p_product_id: productId, p_exclude_offer: excludeOfferId }),
      "lastApprovedAt",
    ) as string | null;
    return value ? new Date(value) : null;
  }

  async ruleConfig() {
    const rows = check(await this.db.from("rule_config").select("key, value"), "ruleConfig") as {
      key: string;
      value: unknown;
    }[];
    return ruleConfigFromRows(rows);
  }

  async saveEvaluation(offerId: string, result: Parameters<IntakeRepo["saveEvaluation"]>[1]): Promise<void> {
    check(await this.db.from("offers").update(result).eq("id", offerId), "saveEvaluation");
  }
}
