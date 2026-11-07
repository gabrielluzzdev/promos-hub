"use server";

import { revalidatePath } from "next/cache";
import { audit, requireOperator } from "@/lib/auth/server";
import type { ActionResult } from "@/lib/panel/types";
import { STORES } from "@/lib/products/stores";
import { parseRuleConfigValue, RULE_CONFIG_KEYS, type RuleConfigKey } from "@/lib/rules/config";
import { createServiceClient } from "@/lib/supabase/server";

function readRuleValue(key: RuleConfigKey, form: FormData): unknown {
  switch (key) {
    case "allowed_stores":
      return form.getAll("allowed_stores").map(String);
    case "silence":
      return { start: String(form.get("silence_start") ?? ""), end: String(form.get("silence_end") ?? "") };
    default:
      return Number(String(form.get(key) ?? "").replace(",", "."));
  }
}

export async function saveRuleConfig(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const operator = await requireOperator({ admin: true });
  const rows: { key: string; value: unknown; updated_by: string; updated_at: string }[] = [];
  for (const key of RULE_CONFIG_KEYS) {
    try {
      rows.push({
        key,
        value: parseRuleConfigValue(key, readRuleValue(key, form)),
        updated_by: operator.id,
        updated_at: new Date().toISOString(),
      });
    } catch {
      return { ok: false, error: `Valor inválido em ${key}.` };
    }
  }
  const allowed = rows.find((r) => r.key === "allowed_stores")!.value as string[];
  if (allowed.some((s) => !STORES.includes(s as (typeof STORES)[number]) || s === "other")) {
    return { ok: false, error: "Loja inválida." };
  }

  const { error } = await operator.db.from("rule_config").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  await audit(operator, "config_change", "rule_config", null, Object.fromEntries(rows.map((r) => [r.key, r.value])));
  revalidatePath("/painel/config");
  return { ok: true, message: "Regras salvas. Valem para as próximas avaliações." };
}

export async function saveCategory(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const operator = await requireOperator({ admin: true });
  const id = String(form.get("id") ?? "");
  const channelUrl = String(form.get("channel_url") ?? "").trim();
  const min = Number(form.get("daily_min_posts"));
  if (channelUrl && !/^https:\/\/(www\.)?whatsapp\.com\/channel\/\S+$/.test(channelUrl)) {
    return { ok: false, error: "Use o link do canal no formato https://whatsapp.com/channel/…" };
  }
  if (!Number.isInteger(min) || min < 0) return { ok: false, error: "Mínimo de posts inválido." };
  const patch = {
    name: String(form.get("name") ?? "").trim(),
    channel_url: channelUrl || null,
    daily_min_posts: min,
    active: form.get("active") === "on",
  };
  if (!patch.name) return { ok: false, error: "Nome obrigatório." };

  const { error } = await operator.db.from("categories").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit(operator, "config_change", "category", id, patch);
  revalidatePath("/painel/config");
  return { ok: true, message: `${patch.name} salva.` };
}

/** Cria a conta do operador (e-mail + senha provisória). O MFA é cadastrado no primeiro login. */
export async function createOperator(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const operator = await requireOperator({ admin: true });
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const displayName = String(form.get("display_name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = form.get("role") === "admin" ? "admin" : "curator";
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "E-mail inválido." };
  if (!displayName) return { ok: false, error: "Informe o nome." };
  if (password.length < 12) return { ok: false, error: "Senha provisória com pelo menos 12 caracteres." };

  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Falha ao criar a conta." };

  const { error: profileError } = await operator.db
    .from("operator_profiles")
    .insert({ user_id: data.user.id, display_name: displayName, role });
  if (profileError) return { ok: false, error: profileError.message };

  await audit(operator, "operator_create", "operator", data.user.id, { email, role });
  revalidatePath("/painel/config");
  return { ok: true, message: `${displayName} criado. Passe a senha provisória por um canal seguro.` };
}

export async function updateOperatorRole(userId: string, role: "admin" | "curator"): Promise<ActionResult> {
  const operator = await requireOperator({ admin: true });
  if (userId === operator.id && role !== "admin") return { ok: false, error: "Você não pode tirar o próprio admin." };
  const { error } = await operator.db.from("operator_profiles").update({ role }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await audit(operator, "operator_role", "operator", userId, { role });
  revalidatePath("/painel/config");
  return { ok: true };
}

export async function removeOperator(userId: string): Promise<ActionResult> {
  const operator = await requireOperator({ admin: true });
  if (userId === operator.id) return { ok: false, error: "Você não pode remover a si mesmo." };
  const { error } = await operator.db.from("operator_profiles").delete().eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await audit(operator, "operator_remove", "operator", userId);
  revalidatePath("/painel/config");
  return { ok: true };
}
