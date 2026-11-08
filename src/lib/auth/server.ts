import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { decidePanelAccess, type Aal, type OperatorRole } from "./access";

export interface Operator {
  id: string;
  email: string | null;
  displayName: string;
  role: OperatorRole;
  db: SupabaseClient;
}

/**
 * Confere sessão, MFA e papel em páginas e server actions (o proxy já filtrou, isto é a segunda checagem).
 * `admin: true` exige admin.
 */
export async function requireOperator(options: { admin?: boolean; path?: string } = {}): Promise<Operator> {
  const db = await createSessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  let aal: Aal = null;
  let profile: { role: OperatorRole; display_name: string } | null = null;
  if (user) {
    const { data: level } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = (level?.currentLevel as Aal) ?? null;
    const { data } = await db
      .from("operator_profiles")
      .select("role, display_name")
      .eq("user_id", user.id)
      .maybeSingle<{ role: OperatorRole; display_name: string }>();
    profile = data;
  }
  const path = options.path ?? (options.admin ? "/painel/config" : "/painel");
  const access = decidePanelAccess({ path, hasUser: Boolean(user), aal, role: profile?.role ?? null });
  if (access.kind === "redirect") redirect(access.to);
  return { id: user!.id, email: user!.email ?? null, displayName: profile!.display_name, role: profile!.role, db };
}

/** Registro de auditoria (aprovar, rejeitar, editar, configurar, responder caixa). */
export async function audit(
  operator: Operator,
  action: string,
  entity: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await operator.db.from("audit_log").insert({
    actor_id: operator.id,
    action,
    entity,
    entity_id: entityId,
    payload,
  });
  if (error) console.error(`[audit] ${action} ${entity}: ${error.message}`);
}
