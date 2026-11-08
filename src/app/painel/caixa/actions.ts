"use server";

import { revalidatePath } from "next/cache";
import { audit, requireOperator } from "@/lib/auth/server";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/panel/types";
import { isWindowOpen } from "@/lib/panel/window";
import { createServiceClient } from "@/lib/supabase/server";
import { GraphWhatsAppClient } from "@/lib/whatsapp/client";

/** Responde pela API só com a janela de 24 h aberta; fora dela, recusa. */
export async function replyInbox(messageId: string, text: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const body = text.trim();
  if (!body) return { ok: false, error: "Escreva a resposta." };
  if (body.length > 4000) return { ok: false, error: "Resposta longa demais." };

  const { data: message } = await operator.db
    .from("inbox_messages")
    .select("id, user_id, answered_at, users!inbox_messages_user_id_fkey(wa_id, last_contact_at)")
    .eq("id", messageId)
    .single<{ id: string; user_id: string; answered_at: string | null; users: { wa_id: string; last_contact_at: string | null } | null }>();
  if (!message || !message.users) return { ok: false, error: "Mensagem não encontrada (a pessoa pode ter saído)." };
  if (message.answered_at) return { ok: false, error: "Já respondida." };

  const last = message.users.last_contact_at ? new Date(message.users.last_contact_at) : null;
  if (!isWindowOpen(last, new Date())) return { ok: false, error: "Janela fechada: passaram 24 h desde a última mensagem." };

  const config = env("WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_GRAPH_VERSION");
  const wa = new GraphWhatsAppClient({
    phoneNumberId: config.WA_PHONE_NUMBER_ID,
    accessToken: config.WA_ACCESS_TOKEN,
    graphVersion: config.WA_GRAPH_VERSION,
  });
  try {
    await wa.sendText(message.users.wa_id, body);
  } catch (error) {
    return { ok: false, error: `WhatsApp recusou: ${error instanceof Error ? error.message : "erro"}` };
  }

  await operator.db
    .from("inbox_messages")
    .update({ answered_by: operator.id, answered_at: new Date().toISOString(), answer_text: body })
    .eq("id", messageId);
  await createServiceClient()
    .from("bot_message_log")
    .insert({ user_id: message.user_id, direction: "out", kind: "inbox_reply", billable: true });

  await audit(operator, "inbox_reply", "inbox_message", messageId);
  revalidatePath("/painel/caixa");
  return { ok: true };
}

/** Marca como resolvida sem responder (ex.: "obrigado"). */
export async function dismissInbox(messageId: string): Promise<ActionResult> {
  const operator = await requireOperator();
  const { error } = await operator.db
    .from("inbox_messages")
    .update({ answered_by: operator.id, answered_at: new Date().toISOString(), answer_text: null })
    .eq("id", messageId)
    .is("answered_at", null);
  if (error) return { ok: false, error: error.message };
  await audit(operator, "inbox_dismiss", "inbox_message", messageId);
  revalidatePath("/painel/caixa");
  return { ok: true };
}
