import type { BotCategory, BotSession, BotStore, BotUser, UserSource } from "@/lib/bot/store";
import type { InboundMessage, ListRow, ReplyButton, WhatsAppSender } from "@/lib/whatsapp/types";

export type Outbound =
  | { type: "text"; to: string; body: string }
  | { type: "list"; to: string; body: string; rows: ListRow[] }
  | { type: "buttons"; to: string; body: string; buttons: ReplyButton[] };

export class FakeWhatsApp implements WhatsAppSender {
  sent: Outbound[] = [];
  async sendText(to: string, body: string) {
    this.sent.push({ type: "text", to, body });
  }
  async sendList(to: string, list: { body: string; button: string; rows: ListRow[] }) {
    this.sent.push({ type: "list", to, body: list.body, rows: list.rows });
  }
  async sendButtons(to: string, message: { body: string; buttons: ReplyButton[] }) {
    this.sent.push({ type: "buttons", to, body: message.body, buttons: message.buttons });
  }
}

export const CATEGORIES: BotCategory[] = [
  { id: "c-geral", slug: "geral", name: "Geral", channelUrl: "https://wa.me/ch/geral", sortOrder: 0 },
  { id: "c-tec", slug: "tecnologia", name: "Tecnologia e PCs", channelUrl: "https://wa.me/ch/tec", sortOrder: 1 },
  { id: "c-games", slug: "games", name: "Games", channelUrl: "https://wa.me/ch/games", sortOrder: 2 },
  { id: "c-casa", slug: "casa", name: "Casa e Decoração", channelUrl: "https://wa.me/ch/casa", sortOrder: 3 },
  { id: "c-moda", slug: "moda", name: "Moda e Calçados", channelUrl: "https://wa.me/ch/moda", sortOrder: 4 },
  { id: "c-livros", slug: "livros_papelaria", name: "Livros e Papelaria", channelUrl: "https://wa.me/ch/livros", sortOrder: 5 },
  { id: "c-beleza", slug: "beleza", name: "Beleza e Cuidados", channelUrl: "https://wa.me/ch/beleza", sortOrder: 6 },
];

interface StoredUser extends BotUser {
  source: UserSource;
  ctwaClid: string | null;
  lastContactAt: Date;
}

export class MemoryBotStore implements BotStore {
  processed = new Set<string>();
  users = new Map<string, StoredUser>();
  consents: { userId: string; version: string; text: string }[] = [];
  prefs = new Map<string, Set<string>>();
  sessions = new Map<string, BotSession>();
  optouts: string[] = [];
  inbox: { userId: string; waMessageId: string; text: string }[] = [];
  log: { userId: string | null; direction: "in" | "out"; kind: string; billable: boolean }[] = [];
  private seq = 0;

  async markProcessed(id: string) {
    if (this.processed.has(id)) return false;
    this.processed.add(id);
    return true;
  }
  async findUserByWaId(waId: string) {
    return [...this.users.values()].find((u) => u.waId === waId) ?? null;
  }
  async createUserWithConsent(input: Parameters<BotStore["createUserWithConsent"]>[0]) {
    const user: StoredUser = {
      id: `u${++this.seq}`,
      waId: input.waId,
      status: "active",
      source: input.source,
      ctwaClid: input.ctwaClid,
      lastContactAt: input.at,
    };
    this.users.set(user.id, user);
    this.consents.push({ userId: user.id, version: input.consentVersion, text: input.consentText });
    return { id: user.id, waId: user.waId, status: user.status };
  }
  async touchUser(userId: string, at: Date) {
    const user = this.users.get(userId);
    if (user) user.lastContactAt = at;
  }
  async setStatus(userId: string, status: BotUser["status"]) {
    const user = this.users.get(userId);
    if (user) user.status = status;
  }
  async listCategories() {
    return CATEGORIES;
  }
  async getPreferenceIds(userId: string) {
    return [...(this.prefs.get(userId) ?? [])];
  }
  async addPreferences(userId: string, ids: string[]) {
    const set = this.prefs.get(userId) ?? new Set<string>();
    ids.forEach((id) => set.add(id));
    this.prefs.set(userId, set);
  }
  async removePreference(userId: string, id: string) {
    this.prefs.get(userId)?.delete(id);
  }
  async getSession(userId: string) {
    return this.sessions.get(userId) ?? null;
  }
  async setSession(userId: string, session: BotSession) {
    this.sessions.set(userId, session);
  }
  async deleteUser(userId: string) {
    this.users.delete(userId);
    this.prefs.delete(userId);
    this.sessions.delete(userId);
    this.consents = this.consents.filter((c) => c.userId !== userId);
    this.inbox = this.inbox.filter((m) => m.userId !== userId);
    this.log = this.log.map((l) => (l.userId === userId ? { ...l, userId: null } : l));
  }
  async logOptout(source: string) {
    this.optouts.push(source);
  }
  async saveInbox(input: Parameters<BotStore["saveInbox"]>[0]) {
    this.inbox.push({ userId: input.userId, waMessageId: input.waMessageId, text: input.text });
  }
  async logMessage(input: Parameters<BotStore["logMessage"]>[0]) {
    this.log.push(input);
  }
}

/** Monta mensagens recebidas de um número, com ids sequenciais. */
export function conversation(from = "5548999990000") {
  let n = 0;
  const base = () => ({ id: `wamid.${from}.${++n}`, from, receivedAt: new Date("2026-11-07T12:00:00Z") });
  return {
    text: (text: string): InboundMessage => ({ ...base(), kind: "text", text }),
    list: (replyId: string): InboundMessage => ({ ...base(), kind: "list_reply", replyId }),
    button: (replyId: string): InboundMessage => ({ ...base(), kind: "button_reply", replyId }),
  };
}
