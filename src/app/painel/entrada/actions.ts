"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { audit, requireOperator } from "@/lib/auth/server";
import { intakeDeps, parserDeps } from "@/lib/intake/deps";
import { createOffer, processRawInput } from "@/lib/intake/pipeline";
import type { ActionResult } from "@/lib/panel/types";
import { storeFromUrl } from "@/lib/products/stores";

const MAX_TEXT = 20_000;

/** Colar: guarda o texto e manda o parser rodar depois da resposta. */
export async function submitPaste(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const operator = await requireOperator();
  const text = String(form.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Cole o texto da oferta." };
  if (text.length > MAX_TEXT) return { ok: false, error: "Texto grande demais; cole até umas 10 ofertas por vez." };

  const { data, error } = await operator.db
    .from("raw_inputs")
    .insert({ source: "manual_text", raw_text: text, submitted_by: operator.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao salvar o texto." };

  after(async () => {
    try {
      await processRawInput(data.id, parserDeps());
    } catch (err) {
      console.error(`[entrada] parser falhou em ${data.id}:`, err instanceof Error ? err.message : err);
    }
  });
  await audit(operator, "submit_paste", "raw_input", data.id);
  revalidatePath("/painel/fila");
  return { ok: true, message: "Recebido. O parser está lendo; as ofertas aparecem na Fila em instantes." };
}

function parseReais(value: string): number | null {
  const cleaned = value.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
}

/** Formulário: pula o parser e segue o mesmo caminho depois dele. */
export async function submitForm(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const operator = await requireOperator();
  const url = String(form.get("url") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const categoryId = String(form.get("categoryId") ?? "");
  const priceCents = parseReais(String(form.get("price") ?? ""));
  const coupon = String(form.get("coupon") ?? "").trim() || null;
  const condition = String(form.get("condition") ?? "").trim() || null;
  const failedRawId = String(form.get("rawId") ?? "") || null;

  const store = storeFromUrl(url);
  if (!store) return { ok: false, error: "Link inválido." };
  if (!title) return { ok: false, error: "Informe o título do post." };
  if (!priceCents) return { ok: false, error: "Preço inválido." };
  if (!categoryId) return { ok: false, error: "Escolha a categoria." };

  const fields = { url, title, categoryId, priceCents, coupon, condition };
  const { data: raw, error } = await operator.db
    .from("raw_inputs")
    .insert({ source: "manual_form", status: "parsed", parser_output: fields, submitted_by: operator.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !raw) return { ok: false, error: error?.message ?? "Falha ao salvar." };

  await createOffer(
    {
      rawInputId: raw.id,
      store,
      name: title,
      brand: null,
      model: null,
      url,
      priceCents,
      claimedBeforeCents: null,
      coupon,
      conditions: null,
      categoryId,
      postTitle: title,
      postCondition: condition ?? (coupon ? `Cupom ${coupon}` : null),
      flags: [],
      priceSource: "manual",
    },
    intakeDeps(),
  );

  // Texto que o parser não entendeu e foi cadastrado à mão sai da lista de falhas.
  if (failedRawId) {
    await operator.db
      .from("raw_inputs")
      .update({ status: "parsed", error: "cadastrado manualmente" })
      .eq("id", failedRawId)
      .eq("status", "failed");
  }

  await audit(operator, "submit_form", "raw_input", raw.id, fields);
  revalidatePath("/painel/fila");
  return { ok: true, message: "Oferta criada e enviada às regras. Veja na Fila." };
}
