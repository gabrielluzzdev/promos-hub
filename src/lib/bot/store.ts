export interface BotCategory {
  id: string;
  slug: string;
  name: string;
  channelUrl: string | null;
  sortOrder: number;
}

export interface BotUser {
  id: string;
  waId: string;
  status: "active" | "paused";
}

export type SessionState = "idle" | "awaiting_more" | "picking_more" | "toggling";

export interface BotSession {
  state: SessionState;
}

export type UserSource = "link" | "ad" | "referral" | "unknown";

/** Acesso a dados do bot. Produção: Supabase com service role. Testes: memória. */
export interface BotStore {
  /** true se a mensagem ainda não tinha sido processada (e agora fica marcada). */
  markProcessed(waMessageId: string): Promise<boolean>;
  findUserByWaId(waId: string): Promise<BotUser | null>;
  createUserWithConsent(input: {
    waId: string;
    source: UserSource;
    ctwaClid: string | null;
    consentVersion: string;
    consentText: string;
    at: Date;
  }): Promise<BotUser>;
  touchUser(userId: string, at: Date): Promise<void>;
  setStatus(userId: string, status: BotUser["status"]): Promise<void>;
  /** Categorias ativas, inclusive a geral, em ordem. */
  listCategories(): Promise<BotCategory[]>;
  getPreferenceIds(userId: string): Promise<string[]>;
  addPreferences(userId: string, categoryIds: string[]): Promise<void>;
  removePreference(userId: string, categoryId: string): Promise<void>;
  getSession(userId: string): Promise<BotSession | null>;
  setSession(userId: string, session: BotSession): Promise<void>;
  /** Apaga a pessoa e tudo dela (preferências, consentimento, sessão, caixa). */
  deleteUser(userId: string): Promise<void>;
  logOptout(source: string): Promise<void>;
  saveInbox(input: { userId: string; waMessageId: string; text: string; receivedAt: Date }): Promise<void>;
  logMessage(input: { userId: string | null; direction: "in" | "out"; kind: string; billable: boolean }): Promise<void>;
}
