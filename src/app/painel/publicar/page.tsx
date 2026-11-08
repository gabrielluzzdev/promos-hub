import { requireOperator } from "@/lib/auth/server";
import { optionalEnv } from "@/lib/env";
import { ensureLink } from "@/lib/panel/links";
import { formatPost } from "@/lib/post/format";
import { ruleConfigFromRows } from "@/lib/rules/config";
import type { Badge } from "@/lib/rules/evaluate";
import { isSilent } from "@/lib/rules/silence";
import { PublishClient, type PendingPost, type RemovalItem } from "./PublishClient";

export const metadata = { title: "Publicar · Promos Hub" };

interface OfferRow {
  id: string;
  status: string;
  category_id: string;
  price_cents: number;
  badge: Badge;
  discount_vs_avg_pct: number | string | null;
  post_title: string;
  post_condition: string | null;
  affiliate_url: string;
  send_to_general: boolean;
  approved_at: string;
  posts: { category_id: string }[];
}

export default async function PublishPage() {
  const { db } = await requireOperator({ path: "/painel/publicar" });
  const domain = optionalEnv("PUBLIC_DOMAIN") ?? "localhost:3000";

  const [{ data: categories }, { data: offers }, { data: configRows }, { data: expired }] = await Promise.all([
    db
      .from("categories")
      .select("id, slug, name, channel_url")
      .eq("active", true)
      .order("sort_order")
      .returns<{ id: string; slug: string; name: string; channel_url: string | null }[]>(),
    db
      .from("offers")
      .select(
        "id, status, category_id, price_cents, badge, discount_vs_avg_pct, post_title, post_condition, affiliate_url, send_to_general, approved_at, posts(category_id)",
      )
      .in("status", ["approved", "published"])
      .order("approved_at", { ascending: true })
      .limit(200)
      .returns<OfferRow[]>(),
    db.from("rule_config").select("key, value"),
    db
      .from("offers")
      .select("id, post_title, expires_at, posts(category_id)")
      .eq("status", "expired")
      .is("removed_from_channels_at", null)
      .order("expires_at", { ascending: true })
      .limit(100)
      .returns<{ id: string; post_title: string; expires_at: string; posts: { category_id: string }[] }[]>(),
  ]);

  const cats = categories ?? [];
  const general = cats.find((c) => c.slug === "geral");
  const pending: PendingPost[] = [];

  for (const offer of offers ?? []) {
    const targets = [offer.category_id];
    if (offer.send_to_general && general) targets.push(general.id);
    for (const categoryId of targets) {
      if (offer.posts.some((p) => p.category_id === categoryId)) continue;
      const code = await ensureLink(db, { offerId: offer.id, categoryId, destination: offer.affiliate_url });
      const category = cats.find((c) => c.id === categoryId);
      pending.push({
        offerId: offer.id,
        categoryId,
        categoryName: category?.name ?? "?",
        channelUrl: category?.channel_url ?? null,
        approvedAt: offer.approved_at,
        text: formatPost({
          title: offer.post_title,
          priceCents: offer.price_cents,
          badge: offer.badge,
          discountVsAvgPct: offer.discount_vs_avg_pct === null ? null : Number(offer.discount_vs_avg_pct),
          condition: offer.post_condition,
          linkCode: code,
          domain,
        }),
      });
    }
  }

  const removals: RemovalItem[] = (expired ?? [])
    .filter((o) => o.posts.length > 0)
    .map((o) => ({
      offerId: o.id,
      title: o.post_title,
      expiresAt: o.expires_at,
      channels: o.posts.map((p) => cats.find((c) => c.id === p.category_id)?.name ?? "?"),
    }));

  const silence = ruleConfigFromRows(configRows ?? []).silence;
  return (
    <PublishClient
      pending={pending}
      removals={removals}
      silent={isSilent(new Date(), silence)}
      silence={silence}
      channelOrder={cats.map((c) => c.id)}
    />
  );
}
