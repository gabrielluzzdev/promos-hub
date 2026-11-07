import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { newLinkCode } from "@/lib/links/code";

/** Garante um código /r/ para a oferta naquele canal (um por oferta e canal). */
export async function ensureLink(
  db: SupabaseClient,
  input: { offerId: string; categoryId: string; destination: string },
): Promise<string> {
  const { data: existing, error: findError } = await db
    .from("links")
    .select("code, destination_url")
    .eq("offer_id", input.offerId)
    .eq("category_id", input.categoryId)
    .maybeSingle<{ code: string; destination_url: string }>();
  if (findError) throw new Error(findError.message);
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newLinkCode();
    const { error } = await db.from("links").insert({
      code,
      offer_id: input.offerId,
      category_id: input.categoryId,
      destination_url: input.destination,
    });
    if (!error) return code;
    // 23505: código repetido (raro) ou outro operador criou o link ao mesmo tempo.
    if (error.code !== "23505") throw new Error(error.message);
    const { data: raced } = await db
      .from("links")
      .select("code")
      .eq("offer_id", input.offerId)
      .eq("category_id", input.categoryId)
      .maybeSingle<{ code: string }>();
    if (raced) return raced.code;
  }
  throw new Error("Não foi possível gerar um código de link único.");
}
