/** Mensagem recebida já normalizada a partir do payload do webhook. */
export interface InboundMessage {
  id: string;
  /** wa_id de quem mandou (só dígitos). */
  from: string;
  receivedAt: Date;
  kind: "text" | "list_reply" | "button_reply" | "other";
  text?: string;
  replyId?: string;
  referral?: { ctwaClid: string | null };
}

export interface ListRow {
  id: string;
  /** Até 24 caracteres. */
  title: string;
  /** Até 72 caracteres. */
  description?: string;
}

export interface ReplyButton {
  id: string;
  /** Até 20 caracteres. */
  title: string;
}

export interface WhatsAppSender {
  sendText(to: string, body: string): Promise<void>;
  sendList(to: string, list: { body: string; button: string; rows: ListRow[] }): Promise<void>;
  sendButtons(to: string, message: { body: string; buttons: ReplyButton[] }): Promise<void>;
}
