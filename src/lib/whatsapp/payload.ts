import type { InboundMessage } from "./types";

interface RawMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    list_reply?: { id?: string; title?: string };
    button_reply?: { id?: string; title?: string };
  };
  referral?: { ctwa_clid?: string; source_type?: string };
}

interface RawPayload {
  object?: string;
  entry?: { changes?: { field?: string; value?: { messages?: RawMessage[]; statuses?: unknown[] } }[] }[];
}

export interface ExtractedPayload {
  messages: InboundMessage[];
  statusCount: number;
}

/** Lê o payload do webhook da Cloud API. Ignora o que não for mensagem; conta status. */
export function extractInbound(payload: unknown): ExtractedPayload {
  const out: ExtractedPayload = { messages: [], statusCount: 0 };
  const body = payload as RawPayload;
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      out.statusCount += Array.isArray(value.statuses) ? value.statuses.length : 0;
      for (const msg of value.messages ?? []) {
        if (!msg.id || !msg.from) continue;
        const seconds = Number(msg.timestamp);
        const base: InboundMessage = {
          id: msg.id,
          from: msg.from,
          receivedAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
          kind: "other",
        };
        if (msg.referral) base.referral = { ctwaClid: msg.referral.ctwa_clid ?? null };

        if (msg.type === "text" && msg.text?.body !== undefined) {
          out.messages.push({ ...base, kind: "text", text: msg.text.body });
        } else if (msg.type === "interactive" && msg.interactive?.type === "list_reply") {
          out.messages.push({
            ...base,
            kind: "list_reply",
            replyId: msg.interactive.list_reply?.id,
            text: msg.interactive.list_reply?.title,
          });
        } else if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
          out.messages.push({
            ...base,
            kind: "button_reply",
            replyId: msg.interactive.button_reply?.id,
            text: msg.interactive.button_reply?.title,
          });
        } else if (msg.type === "button") {
          out.messages.push({ ...base, kind: "button_reply", replyId: msg.button?.payload, text: msg.button?.text });
        } else {
          out.messages.push(base);
        }
      }
    }
  }
  return out;
}
