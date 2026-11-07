"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/panel/types";
import { STORE_LABELS, STORES } from "@/lib/products/stores";
import type { RuleConfig } from "@/lib/rules/config";
import { createOperator, removeOperator, saveCategory, saveRuleConfig, updateOperatorRole } from "./actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? <p className="notice">{state.message ?? "Salvo."}</p> : <p className="error">{state.error}</p>;
}

export function RuleConfigForm({ config }: { config: RuleConfig }) {
  const [state, action, pending] = useActionState(saveRuleConfig, null);
  return (
    <form action={action} className="card stack">
      <div className="grid-2">
        <label>
          <span>Desconto mínimo vs média de 90 dias (%)</span>
          <input name="min_discount_pct" type="number" min={0} max={100} step="0.5" defaultValue={config.min_discount_pct} />
        </label>
        <label>
          <span>Bloquear repetida por (dias)</span>
          <input name="dup_block_days" type="number" min={0} defaultValue={config.dup_block_days} />
        </label>
        <label>
          <span>Validade da oferta (horas)</span>
          <input name="offer_ttl_hours" type="number" min={1} defaultValue={config.offer_ttl_hours} />
        </label>
        <label>
          <span>Selo: histórico mínimo (dias)</span>
          <input name="badge_min_history_days" type="number" min={0} defaultValue={config.badge_min_history_days} />
        </label>
        <label>
          <span>Selo: mínimo de preços no histórico</span>
          <input name="badge_min_price_points" type="number" min={1} defaultValue={config.badge_min_price_points} />
        </label>
        <div className="row">
          <label style={{ flex: 1 }}>
            <span>Silêncio começa</span>
            <input name="silence_start" type="time" defaultValue={config.silence.start} />
          </label>
          <label style={{ flex: 1 }}>
            <span>Silêncio termina</span>
            <input name="silence_end" type="time" defaultValue={config.silence.end} />
          </label>
        </div>
      </div>
      <fieldset>
        <span style={{ fontWeight: 600 }}>Lojas permitidas</span>
        <div className="row">
          {STORES.filter((s) => s !== "other").map((store) => (
            <label key={store} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                name="allowed_stores"
                value={store}
                style={{ width: "auto" }}
                defaultChecked={config.allowed_stores.includes(store)}
              />
              {STORE_LABELS[store]}
            </label>
          ))}
        </div>
      </fieldset>
      <Feedback state={state} />
      <div>
        <button type="submit" className="primary" disabled={pending}>
          Salvar regras
        </button>
      </div>
    </form>
  );
}

export function CategoryRow({
  category,
}: {
  category: { id: string; slug: string; name: string; channel_url: string | null; daily_min_posts: number; active: boolean };
}) {
  const [state, action, pending] = useActionState(saveCategory, null);
  return (
    <form action={action} className="card stack">
      <input type="hidden" name="id" value={category.id} />
      <div className="row">
        <strong>{category.name}</strong>
        <small className="muted">{category.slug}</small>
      </div>
      <div className="grid-2">
        <label>
          <span>Nome</span>
          <input name="name" defaultValue={category.name} required />
        </label>
        <label>
          <span>Link do canal</span>
          <input name="channel_url" type="url" placeholder="https://whatsapp.com/channel/…" defaultValue={category.channel_url ?? ""} />
        </label>
        <label>
          <span>Mínimo de posts por dia</span>
          <input name="daily_min_posts" type="number" min={0} defaultValue={category.daily_min_posts} />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", alignSelf: "end" }}>
          <input type="checkbox" name="active" style={{ width: "auto" }} defaultChecked={category.active} />
          <span>Ativa</span>
        </label>
      </div>
      <Feedback state={state} />
      <div>
        <button type="submit" disabled={pending}>
          Salvar
        </button>
      </div>
    </form>
  );
}

export function NewOperatorForm() {
  const [state, action, pending] = useActionState(createOperator, null);
  return (
    <form action={action} className="card stack">
      <strong>Novo operador</strong>
      <div className="grid-2">
        <label>
          <span>Nome</span>
          <input name="display_name" required />
        </label>
        <label>
          <span>E-mail</span>
          <input name="email" type="email" required />
        </label>
        <label>
          <span>Senha provisória (12+ caracteres)</span>
          <input name="password" type="text" minLength={12} required autoComplete="off" />
        </label>
        <label>
          <span>Papel</span>
          <select name="role" defaultValue="curator">
            <option value="curator">Curador</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <Feedback state={state} />
      <div>
        <button type="submit" className="primary" disabled={pending}>
          Criar operador
        </button>
      </div>
    </form>
  );
}

export function OperatorRow({
  operator,
  isSelf,
}: {
  operator: { user_id: string; display_name: string; role: "admin" | "curator" };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result.ok ? null : result.error);
      router.refresh();
    });
  return (
    <tr>
      <td>
        {operator.display_name} {isSelf && <small className="muted">(você)</small>}
        {error && <div className="error">{error}</div>}
      </td>
      <td>
        <select
          value={operator.role}
          disabled={pending || isSelf}
          onChange={(event) => run(() => updateOperatorRole(operator.user_id, event.target.value as "admin" | "curator"))}
        >
          <option value="curator">Curador</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td>
        {!isSelf && (
          <button type="button" className="danger" disabled={pending} onClick={() => run(() => removeOperator(operator.user_id))}>
            Remover acesso
          </button>
        )}
      </td>
    </tr>
  );
}
