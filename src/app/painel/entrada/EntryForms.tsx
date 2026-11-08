"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult, CategoryOption } from "@/lib/panel/types";
import { submitForm, submitPaste } from "./actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="notice" role="status">
      {state.message}
    </p>
  ) : (
    <p className="error" role="alert">
      {state.error}
    </p>
  );
}

export function PasteForm() {
  const [state, action, pending] = useActionState(submitPaste, null);
  return (
    <form action={action} className="stack">
      <label>
        <span>Texto das ofertas</span>
        <textarea
          name="text"
          rows={12}
          placeholder="Cole aqui uma ou mais ofertas copiadas de grupos (até 10 por vez)."
          required
          autoFocus
        />
      </label>
      <Feedback state={state} />
      <div className="row">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Enviando…" : "Enviar para o parser"}
        </button>
      </div>
    </form>
  );
}

export function ManualForm({
  categories,
  rawId,
  rawText,
}: {
  categories: CategoryOption[];
  rawId: string | null;
  rawText: string | null;
}) {
  const [state, action, pending] = useActionState(submitForm, null);
  return (
    <div className={rawText ? "grid-2" : undefined}>
      <form action={action} className="stack">
        {rawId && <input type="hidden" name="rawId" value={rawId} />}
        <label>
          <span>Link do produto</span>
          <input name="url" type="url" placeholder="https://www.amazon.com.br/dp/…" required autoFocus />
        </label>
        <label>
          <span>Título do post</span>
          <input name="title" maxLength={80} placeholder='Monitor LG UltraGear 27" 144Hz' required />
        </label>
        <div className="grid-2">
          <label>
            <span>Preço (R$)</span>
            <input name="price" inputMode="decimal" placeholder="1.099,90" required />
          </label>
          <label>
            <span>Categoria</span>
            <select name="categoryId" required defaultValue="">
              <option value="" disabled>
                — escolha —
              </option>
              {categories
                .filter((c) => c.slug !== "geral")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label>
            <span>Cupom (opcional)</span>
            <input name="coupon" />
          </label>
          <label>
            <span>Condição (opcional)</span>
            <input name="condition" placeholder="Só no app" />
          </label>
        </div>
        <Feedback state={state} />
        <div className="row">
          <button type="submit" className="primary" disabled={pending}>
            {pending ? "Criando…" : "Criar oferta"}
          </button>
          {state?.ok && <Link href="/painel/fila">Ir para a Fila</Link>}
        </div>
      </form>
      {rawText && (
        <div className="stack">
          <strong>Texto original</strong>
          <pre className="post">{rawText}</pre>
        </div>
      )}
    </div>
  );
}
