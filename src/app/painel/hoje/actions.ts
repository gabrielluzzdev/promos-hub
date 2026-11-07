"use server";

import { revalidatePath } from "next/cache";
import { audit, requireOperator } from "@/lib/auth/server";
import { ensureLink } from "@/lib/panel/links";
import type { ActionResult } from "@/lib/panel/types";

/** Manda uma oferta também para o canal Geral (aparece em Publicar). */
export async function sendToGeneral(offerId: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const { db } = operator;

  const { data: offer } = await db
    .from("offers")
    .select("status, affiliate_url")
    .eq("id", offerId)
    .single<{ status: string; affiliate_url: string | null }>();
  if (!offer || !["approved", "published"].includes(offer.status) || !offer.affiliate_url) {
    return { ok: false, error: "Só ofertas aprovadas e ainda válidas vão para o Geral." };
  }
  const { data: general } = await db.from("categories").select("id").eq("slug", "geral").single<{ id: string }>();
  if (!general) return { ok: false, error: "Canal Geral não configurado." };

  const { error } = await db.from("offers").update({ send_to_general: true }).eq("id", offerId);
  if (error) return { ok: false, error: error.message };
  await ensureLink(db, { offerId, categoryId: general.id, destination: offer.affiliate_url });

  await audit(operator, "send_to_general", "offer", offerId);
  revalidatePath("/painel/hoje");
  revalidatePath("/painel/publicar");
  return { ok: true, message: "Vai aparecer em Publicar, no grupo Geral." };
}
