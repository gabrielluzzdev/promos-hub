import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BotCategory, BotSession, BotStore, BotUser, SessionState } from "./store";

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

interface UserRow {
  id: string;
  wa_id: string;
  status: BotUser["status"];
}

const toUser = (row: UserRow): BotUser => ({ id: row.id, waId: row.wa_id, status: row.status });

/** BotStore sobre o Supabase com a service role. */
export class SupabaseBotStore implements BotStore {
  constructor(private readonly db: SupabaseClient) {}

  async markProcessed(waMessageId: string): Promise<boolean> {
    const rows = check(
      await this.db
        .from("processed_wa_messages")
        .upsert({ wa_message_id: waMessageId }, { onConflict: "wa_message_id", ignoreDuplicates: true })
        .select("wa_message_id"),
      "markProcessed",
    );
    return (rows ?? []).length > 0;
  }

  async findUserByWaId(waId: string): Promise<BotUser | null> {
    const row = check(
      await this.db.from("users").select("id, wa_id, status").eq("wa_id", waId).maybeSingle<UserRow>(),
      "findUserByWaId",
    );
    return row ? toUser(row) : null;
  }

  async createUserWithConsent(input: Parameters<BotStore["createUserWithConsent"]>[0]): Promise<BotUser> {
    const row = check(
      await this.db
        .from("users")
        .insert({
          wa_id: input.waId,
          phone_e164: `+${input.waId}`,
          source: input.source,
          ctwa_clid: input.ctwaClid,
          last_contact_at: input.at.toISOString(),
        })
        .select("id, wa_id, status")
        .single<UserRow>(),
      "createUser",
    );
    check(
      await this.db.from("consents").insert({
        user_id: row.id,
        consent_version: input.consentVersion,
        consent_text: input.consentText,
        accepted_at: input.at.toISOString(),
      }),
      "createConsent",
    );
    return toUser(row);
  }

  async touchUser(userId: string, at: Date): Promise<void> {
    check(await this.db.from("users").update({ last_contact_at: at.toISOString() }).eq("id", userId), "touchUser");
  }

  async setStatus(userId: string, status: BotUser["status"]): Promise<void> {
    check(await this.db.from("users").update({ status }).eq("id", userId), "setStatus");
  }

  async listCategories(): Promise<BotCategory[]> {
    const rows = check(
      await this.db
        .from("categories")
        .select("id, slug, name, channel_url, sort_order")
        .eq("active", true)
        .order("sort_order"),
      "listCategories",
    ) as { id: string; slug: string; name: string; channel_url: string | null; sort_order: number }[];
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, channelUrl: r.channel_url, sortOrder: r.sort_order }));
  }

  async getPreferenceIds(userId: string): Promise<string[]> {
    const rows = check(
      await this.db.from("preferences").select("category_id").eq("user_id", userId),
      "getPreferences",
    ) as { category_id: string }[];
    return rows.map((r) => r.category_id);
  }

  async addPreferences(userId: string, categoryIds: string[]): Promise<void> {
    if (!categoryIds.length) return;
    check(
      await this.db
        .from("preferences")
        .upsert(
          categoryIds.map((category_id) => ({ user_id: userId, category_id })),
          { onConflict: "user_id,category_id", ignoreDuplicates: true },
        ),
      "addPreferences",
    );
  }

  async removePreference(userId: string, categoryId: string): Promise<void> {
    check(
      await this.db.from("preferences").delete().eq("user_id", userId).eq("category_id", categoryId),
      "removePreference",
    );
  }

  async getSession(userId: string): Promise<BotSession | null> {
    const row = check(
      await this.db.from("bot_sessions").select("state").eq("user_id", userId).maybeSingle<{ state: SessionState }>(),
      "getSession",
    );
    return row ? { state: row.state } : null;
  }

  async setSession(userId: string, session: BotSession): Promise<void> {
    check(
      await this.db
        .from("bot_sessions")
        .upsert({ user_id: userId, state: session.state, updated_at: new Date().toISOString() }, { onConflict: "user_id" }),
      "setSession",
    );
  }

  async deleteUser(userId: string): Promise<void> {
    check(await this.db.from("users").delete().eq("id", userId), "deleteUser");
  }

  async logOptout(source: string): Promise<void> {
    check(await this.db.from("optout_log").insert({ source }), "logOptout");
  }

  async saveInbox(input: Parameters<BotStore["saveInbox"]>[0]): Promise<void> {
    check(
      await this.db.from("inbox_messages").upsert(
        {
          user_id: input.userId,
          wa_message_id: input.waMessageId,
          text: input.text,
          received_at: input.receivedAt.toISOString(),
        },
        { onConflict: "wa_message_id", ignoreDuplicates: true },
      ),
      "saveInbox",
    );
  }

  async logMessage(input: Parameters<BotStore["logMessage"]>[0]): Promise<void> {
    check(
      await this.db.from("bot_message_log").insert({
        user_id: input.userId,
        direction: input.direction,
        kind: input.kind,
        billable: input.billable,
      }),
      "logMessage",
    );
  }
}
