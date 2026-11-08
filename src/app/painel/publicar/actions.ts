"use server";

import { revalidatePath } from "next/cache";
import { audit, requireOperator } from "@/lib/auth/server";
import type { ActionResult } from "@/lib/panel/types";
import { ruleConfigFromRows } from "@/lib/rules/config";
import { isSilent } from "@/lib/rules/silence";

export async function markPosted(offerId: string, categoryId: string, text: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const { db } = operator;

  const { data: configRows } = await db.from("rule_config").select("key, value");
  if (isSilent(new Date(), ruleConfigFromRows(configRows ?? []).silence)) {
    return { ok: false, error: "Horário de silêncio: a publicação fica para depois." };
  }

  const { data: offer } = await db
    .from("offers")
    .select("status, published_at")
    .eq("id", offerId)
    .single<{ status: string; published_at: string | null }>();
  if (!offer || !["approved", "published"].includes(offer.status)) {
    return { ok: false, error: "A oferta não está aprovada (pode ter expirado)." };
  }

  const now = new Date().toISOString();
  const { error } = await db.from("posts").insert({
    offer_id: offerId,
    category_id: categoryId,
    text,
    mode: "assisted",
    posted_by: operator.id,
    posted_at: now,
  });
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  if (offer.status === "approved") {
    await db.from("offers").update({ status: "published", published_at: now }).eq("id", offerId).eq("status", "approved");
  }

  await audit(operator, "mark_posted", "offer", offerId, { category_id: categoryId });
  revalidatePath("/painel/publicar");
  revalidatePath("/painel/hoje");
  return { ok: true };
}

export async function markRemoved(offerId: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const { error } = await operator.db
    .from("offers")
    .update({ removed_from_channels_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("status", "expired");
  if (error) return { ok: false, error: error.message };
  await audit(operator, "mark_removed", "offer", offerId);
  revalidatePath("/painel/publicar");
  return { ok: true };
}
