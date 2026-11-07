"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";
import type { CategoryOption, FailedInput, QueueOffer } from "@/lib/panel/types";
import { formatPost, formatPrice } from "@/lib/post/format";
import { STORE_LABELS } from "@/lib/products/stores";
import { approveOffer, discardFailedInput, editOffer, rejectOffer, type OfferEdit } from "./actions";

const QUICK_REASONS = [
  "Preço não compensa",
  "Produto ou loja duvidosa",
  "Link quebrado ou esgotado",
  "Repetida",
  "Fora do nosso público",
];

const BADGE_LABEL = { lowest_90d: "menor preço em 90 dias", below_avg: "abaixo da média", none: "sem selo" } as const;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function QueueClient(props: {
  offers: QueueOffer[];
  categories: CategoryOption[];
  failedInputs: FailedInput[];
  domain: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const offers = useMemo(() => props.offers.filter((o) => !hidden.has(o.id)), [props.offers, hidden]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [affiliate, setAffiliate] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const affiliateRef = useRef<HTMLInputElement>(null);
  const rejectRef = useRef<HTMLInputElement>(null);

  const active = offers[Math.min(index, Math.max(offers.length - 1, 0))];
  const categoryName = useCallback(
    (id: string | null) => props.categories.find((c) => c.id === id)?.name ?? "sem categoria",
    [props.categories],
  );

  const affiliateFor = useCallback((o: QueueOffer) => affiliate[o.id] ?? o.affiliateUrl ?? "", [affiliate]);
  const generalFor = useCallback((o: QueueOffer) => general[o.id] ?? o.sendToGeneral, [general]);

  const removeActive = useCallback(
    (id: string) => {
      setHidden((prev) => new Set(prev).add(id));
      setMode("view");
      router.refresh();
    },
    [router],
  );

  const approve = useCallback(() => {
    if (!active) return;
    const url = affiliateFor(active).trim();
    if (!url) {
      setMessage({ kind: "error", text: "Cole o link de afiliado e aperte Enter." });
      affiliateRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await approveOffer(active.id, { affiliateUrl: url, sendToGeneral: generalFor(active) });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setMessage({ kind: "notice", text: `Aprovada: ${active.postTitle}` });
      removeActive(active.id);
    });
  }, [active, affiliateFor, generalFor, removeActive]);

  const reject = useCallback(
    (reason: string) => {
      if (!active) return;
      startTransition(async () => {
        const result = await rejectOffer(active.id, reason);
        if (!result.ok) return setMessage({ kind: "error", text: result.error });
        setMessage({ kind: "notice", text: `Rejeitada: ${active.postTitle}` });
        removeActive(active.id);
      });
    },
    [active, removeActive],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        setMode("view");
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
      if (isTyping(event.target) || pending) return;
      if (mode === "reject" && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        reject(QUICK_REASONS[Number(event.key) - 1]!);
        return;
      }
      if (mode !== "view") return;
      switch (event.key.toLowerCase()) {
        case "j":
        case "arrowdown":
          event.preventDefault();
          setIndex((i) => Math.min(i + 1, offers.length - 1));
          setMessage(null);
          break;
        case "k":
        case "arrowup":
          event.preventDefault();
          setIndex((i) => Math.max(i - 1, 0));
          setMessage(null);
          break;
        case "a":
          event.preventDefault();
          approve();
          break;
        case "e":
          event.preventDefault();
          setMode("edit");
          break;
        case "r":
          event.preventDefault();
          setMode("reject");
          setTimeout(() => rejectRef.current?.focus(), 0);
          break;
        case "g":
          if (active) setGeneral((prev) => ({ ...prev, [active.id]: !generalFor(active) }));
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, pending, offers.length, approve, reject, active, generalFor]);

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Fila de revisão</h1>
        <span className="badge">{offers.length} pendente(s)</span>
        <span className="spacer" />
        <small>
          <kbd>J</kbd>/<kbd>K</kbd> mover · <kbd>A</kbd> aprovar · <kbd>E</kbd> editar · <kbd>R</kbd> rejeitar ·{" "}
          <kbd>G</kbd> também no Geral · <kbd>Esc</kbd> cancelar
        </small>
      </div>

      {message && (
        <p className={message.kind === "error" ? "error" : "notice"} role="status">
          {message.text}
        </p>
      )}

      {offers.length === 0 && <div className="card muted">Nada na fila. Cole ofertas em Entrada.</div>}

      {active && (
        <OfferCard
          key={active.id}
          offer={active}
          domain={props.domain}
          categoryName={categoryName(active.categoryId)}
          affiliateUrl={affiliateFor(active)}
          onAffiliateChange={(value) => setAffiliate((prev) => ({ ...prev, [active.id]: value }))}
          sendToGeneral={generalFor(active)}
          onGeneralChange={(value) => setGeneral((prev) => ({ ...prev, [active.id]: value }))}
          affiliateRef={affiliateRef}
          onApprove={approve}
          pending={pending}
        />
      )}

      {active && mode === "edit" && (
        <EditForm
          key={`edit-${active.id}`}
          offer={active}
          categories={props.categories}
          affiliateUrl={affiliateFor(active)}
          pending={pending}
          onCancel={() => setMode("view")}
          onSave={(edit) =>
            startTransition(async () => {
              const result = await editOffer(active.id, edit);
              if (!result.ok) return setMessage({ kind: "error", text: result.error });
              setAffiliate((prev) => ({ ...prev, [active.id]: edit.affiliateUrl }));
              setMessage({ kind: "notice", text: result.message ?? "Edição salva e regras recalculadas." });
              setMode("view");
              router.refresh();
            })
          }
        />
      )}

      {active && mode === "reject" && (
        <div className="card stack">
          <strong>Motivo da rejeição</strong>
          <div className="row">
            {QUICK_REASONS.map((reason, i) => (
              <button key={reason} type="button" onClick={() => reject(reason)} disabled={pending}>
                <kbd>{i + 1}</kbd> {reason}
              </button>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              const value = rejectRef.current?.value ?? "";
              if (value.trim()) reject(value);
            }}
          >
            <input ref={rejectRef} placeholder="Ou escreva o motivo e aperte Enter" style={{ flex: 1 }} />
            <button type="submit" className="danger" disabled={pending}>
              Rejeitar
            </button>
          </form>
        </div>
      )}

      {offers.length > 1 && (
        <div className="stack">
          <h2>Próximas</h2>
          {offers.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className={i === index ? "card active" : "card"}
              style={{ textAlign: "left", display: "block" }}
              onClick={() => {
                setIndex(i);
                setMode("view");
              }}
            >
              <strong>{o.postTitle}</strong>{" "}
              <small>
                · {STORE_LABELS[o.store]} · {o.priceCents ? formatPrice(o.priceCents) : "sem preço"} ·{" "}
                {categoryName(o.categoryId)}
              </small>
            </button>
          ))}
        </div>
      )}

      {props.failedInputs.length > 0 && (
        <div className="stack">
          <h2>Textos que o parser não entendeu</h2>
          <p className="muted">Cadastre pelo formulário em Entrada ou descarte.</p>
          {props.failedInputs.map((f) => (
            <div key={f.id} className="card stack">
              <pre className="post">{f.rawText}</pre>
              {f.error && <small className="error">{f.error}</small>}
              <div className="row">
                <a className="button" href={`/painel/entrada?modo=form&raw=${f.id}`}>
                  Cadastrar manualmente
                </a>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await discardFailedInput(f.id);
                      if (!result.ok) setMessage({ kind: "error", text: result.error });
                      router.refresh();
                    })
                  }
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard(props: {
  offer: QueueOffer;
  domain: string;
  categoryName: string;
  affiliateUrl: string;
  onAffiliateChange: (value: string) => void;
  sendToGeneral: boolean;
  onGeneralChange: (value: boolean) => void;
  affiliateRef: RefObject<HTMLInputElement | null>;
  onApprove: () => void;
  pending: boolean;
}) {
  const o = props.offer;
  const preview = o.priceCents
    ? formatPost({
        title: o.postTitle,
        priceCents: o.priceCents,
        badge: o.badge,
        discountVsAvgPct: o.discountVsAvgPct,
        condition: o.postCondition,
        linkCode: "xxxxxx",
        domain: props.domain,
      })
    : null;

  return (
    <div className="card active stack">
      <div className="row">
        <strong style={{ fontSize: 17 }}>{o.productName}</strong>
        <span className="badge">{STORE_LABELS[o.store]}</span>
        <span className="badge">{props.categoryName}</span>
        {o.flags.map((flag) => (
          <span key={flag} className={flag === "possible_scam" ? "badge fail" : "badge warn"}>
            {flag}
          </span>
        ))}
      </div>

      <div className="grid-2">
        <table>
          <tbody>
            <tr>
              <th>Preço</th>
              <td>{o.priceCents ? formatPrice(o.priceCents) : <span className="error">sem preço</span>}</td>
            </tr>
            <tr>
              <th>Mín. 90 dias</th>
              <td>{o.min90d ? formatPrice(o.min90d) : "—"}</td>
            </tr>
            <tr>
              <th>Média 90 dias</th>
              <td>
                {o.avg90d ? formatPrice(Math.round(o.avg90d)) : "—"} <small>({o.pricePoints} preços)</small>
              </td>
            </tr>
            <tr>
              <th>Selo</th>
              <td>
                {BADGE_LABEL[o.badge]}
                {o.discountVsAvgPct !== null && <small> · {o.discountVsAvgPct.toLocaleString("pt-BR")}% vs média</small>}
              </td>
            </tr>
            <tr>
              <th>&quot;De&quot; da loja</th>
              <td>
                {o.claimedBeforeCents ? formatPrice(o.claimedBeforeCents) : "—"} <small>(não verificado)</small>
              </td>
            </tr>
            {(o.coupon || o.conditions) && (
              <tr>
                <th>Condições</th>
                <td>{[o.coupon && `Cupom ${o.coupon}`, o.conditions].filter(Boolean).join(" · ")}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="stack">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {o.ruleResults.map((r) => (
              <li
                key={r.rule}
                style={{ color: r.outcome === "fail" ? "var(--danger)" : r.outcome === "warn" ? "var(--warn)" : "var(--muted)" }}
              >
                {r.reason_ptbr}
              </li>
            ))}
          </ul>
          {o.possibleDuplicate && (
            <p className="banner" style={{ margin: 0 }}>
              Possível produto repetido: {o.possibleDuplicate.name}
            </p>
          )}
          {o.sourceUrl && (
            <a href={o.sourceUrl} target="_blank" rel="noreferrer noopener">
              Abrir na loja ↗
            </a>
          )}
        </div>
      </div>

      <div className="stack">
        <strong>Prévia do post</strong>
        {preview ? <pre className="post">{preview}</pre> : <p className="muted">Preencha o preço para ver a prévia.</p>}
      </div>

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          props.onApprove();
        }}
      >
        <label style={{ flex: 1 }}>
          <span>Link de afiliado</span>
          <input
            ref={props.affiliateRef}
            value={props.affiliateUrl}
            onChange={(event) => props.onAffiliateChange(event.target.value)}
            placeholder="https://… (obrigatório para aprovar)"
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={props.sendToGeneral}
            onChange={(event) => props.onGeneralChange(event.target.checked)}
          />
          <span>Também no Geral</span>
        </label>
        <button type="submit" className="primary" disabled={props.pending}>
          Aprovar <kbd>A</kbd>
        </button>
      </form>
    </div>
  );
}

function EditForm(props: {
  offer: QueueOffer;
  categories: CategoryOption[];
  affiliateUrl: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (edit: OfferEdit) => void;
}) {
  const o = props.offer;
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        props.onSave({
          postTitle: String(data.get("postTitle") ?? ""),
          postCondition: String(data.get("postCondition") ?? ""),
          priceReais: String(data.get("price") ?? ""),
          categoryId: String(data.get("categoryId") ?? ""),
          affiliateUrl: String(data.get("affiliateUrl") ?? ""),
        });
      }}
    >
      <strong>Editar oferta</strong>
      <label>
        <span>Título do post</span>
        <input ref={firstRef} name="postTitle" defaultValue={o.postTitle} maxLength={80} required />
      </label>
      <label>
        <span>Condição (uma linha, opcional)</span>
        <input name="postCondition" defaultValue={o.postCondition ?? ""} />
      </label>
      <div className="grid-2">
        <label>
          <span>Preço (R$)</span>
          <input
            name="price"
            inputMode="decimal"
            defaultValue={o.priceCents ? (o.priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}
          />
        </label>
        <label>
          <span>Categoria</span>
          <select name="categoryId" defaultValue={o.categoryId ?? ""}>
            <option value="">— escolha —</option>
            {props.categories
              .filter((c) => c.slug !== "geral")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label>
        <span>Link de afiliado</span>
        <input name="affiliateUrl" defaultValue={props.affiliateUrl} />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={props.pending}>
          Salvar e recalcular regras
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar <kbd>Esc</kbd>
        </button>
      </div>
    </form>
  );
}
