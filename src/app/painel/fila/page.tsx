import { requireOperator } from "@/lib/auth/server";
import { optionalEnv } from "@/lib/env";
import type { CategoryOption, FailedInput, QueueOffer } from "@/lib/panel/types";
import type { Badge, RuleResult } from "@/lib/rules/evaluate";
import type { Store } from "@/lib/products/stores";
import { QueueClient } from "./QueueClient";

export const metadata = { title: "Fila · Promos Hub" };

interface OfferRow {
  id: string;
  created_at: string;
  category_id: string | null;
  price_cents: number | null;
  claimed_before_cents: number | null;
  coupon: string | null;
  conditions: string | null;
  post_title: string;
  post_condition: string | null;
  affiliate_url: string | null;
  source_url: string | null;
  flags: string[];
  rule_results: RuleResult[];
  badge: Badge;
  discount_vs_avg_pct: number | string | null;
  send_to_general: boolean;
  product_id: string;
  possible_duplicate_of: string | null;
  product: { name: string; store: Store } | null;
  duplicate: { id: string; name: string } | null;
}

export default async function QueuePage() {
  const { db } = await requireOperator({ path: "/painel/fila" });

  const [{ data: offers }, { data: categories }, { data: failed }] = await Promise.all([
    db
      .from("offers")
      .select(
        "id, created_at, category_id, price_cents, claimed_before_cents, coupon, conditions, post_title, post_condition, affiliate_url, source_url, flags, rule_results, badge, discount_vs_avg_pct, send_to_general, product_id, possible_duplicate_of, product:products!offers_product_id_fkey(name, store), duplicate:products!offers_possible_duplicate_of_fkey(id, name)",
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .limit(50)
      .returns<OfferRow[]>(),
    db.from("categories").select("id, slug, name").eq("active", true).order("sort_order").returns<CategoryOption[]>(),
    db
      .from("raw_inputs")
      .select("id, raw_text, error, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: true })
      .limit(20)
      .returns<{ id: string; raw_text: string | null; error: string | null; created_at: string }[]>(),
  ]);

  const queue: QueueOffer[] = await Promise.all(
    (offers ?? []).map(async (o) => {
      const { data: stats } = await db
        .rpc("price_stats", { p_product_id: o.product_id, p_before: o.created_at })
        .returns<{ min_90d: number | null; avg_90d: number | string | null; points: number }[]>();
      const s = stats?.[0];
      return {
        id: o.id,
        createdAt: o.created_at,
        productName: o.product?.name ?? o.post_title,
        store: o.product?.store ?? "other",
        sourceUrl: o.source_url,
        categoryId: o.category_id,
        priceCents: o.price_cents,
        claimedBeforeCents: o.claimed_before_cents,
        coupon: o.coupon,
        conditions: o.conditions,
        postTitle: o.post_title,
        postCondition: o.post_condition,
        affiliateUrl: o.affiliate_url,
        flags: o.flags,
        ruleResults: o.rule_results ?? [],
        badge: o.badge,
        discountVsAvgPct: o.discount_vs_avg_pct === null ? null : Number(o.discount_vs_avg_pct),
        min90d: s?.min_90d ?? null,
        avg90d: s?.avg_90d === null || s?.avg_90d === undefined ? null : Number(s.avg_90d),
        pricePoints: s?.points ?? 0,
        possibleDuplicate: o.duplicate,
        sendToGeneral: o.send_to_general,
      };
    }),
  );

  const failedInputs: FailedInput[] = (failed ?? []).map((f) => ({
    id: f.id,
    rawText: f.raw_text ?? "",
    error: f.error,
    createdAt: f.created_at,
  }));

  return (
    <QueueClient
      offers={queue}
      categories={categories ?? []}
      failedInputs={failedInputs}
      domain={optionalEnv("PUBLIC_DOMAIN") ?? "localhost:3000"}
    />
  );
}
