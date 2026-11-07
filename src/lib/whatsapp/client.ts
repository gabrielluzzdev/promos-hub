import type { ListRow, ReplyButton, WhatsAppSender } from "./types";

export interface GraphConfig {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  fetchImpl?: typeof fetch;
}

/** Cliente fino sobre a Graph API usando fetch (o SDK oficial de Node foi arquivado). */
export class GraphWhatsAppClient implements WhatsAppSender {
  constructor(private readonly config: GraphConfig) {}

  private async post(to: string, message: Record<string, unknown>): Promise<void> {
    const { phoneNumberId, accessToken, graphVersion } = this.config;
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...message }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Graph API ${response.status}: ${detail.slice(0, 300)}`);
    }
  }

  sendText(to: string, body: string): Promise<void> {
    return this.post(to, { type: "text", text: { body, preview_url: false } });
  }

  sendList(to: string, list: { body: string; button: string; rows: ListRow[] }): Promise<void> {
    return this.post(to, {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: list.body },
        action: {
          button: list.button,
          sections: [{ title: "Categorias", rows: list.rows }],
        },
      },
    });
  }

  sendButtons(to: string, message: { body: string; buttons: ReplyButton[] }): Promise<void> {
    return this.post(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: message.body },
        action: { buttons: message.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      },
    });
  }
}
