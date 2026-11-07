"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markPosted, markRemoved } from "./actions";

export interface PendingPost {
  offerId: string;
  categoryId: string;
  categoryName: string;
  channelUrl: string | null;
  approvedAt: string;
  text: string;
}

export interface RemovalItem {
  offerId: string;
  title: string;
  expiresAt: string;
  channels: string[];
}

export function PublishClient(props: {
  pending: PendingPost[];
  removals: RemovalItem[];
  silent: boolean;
  silence: { start: string; end: string };
  channelOrder: string[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = props.channelOrder
    .map((id) => props.pending.filter((p) => p.categoryId === id))
    .filter((group) => group.length > 0);

  async function copy(post: PendingPost) {
    await navigator.clipboard.writeText(post.text);
    setCopied(`${post.offerId}:${post.categoryId}`);
  }

  return (
    <div className="stack">
      <h1>Publicar</h1>
      {props.silent && (
        <div className="banner" role="status">
          Horário de silêncio ({props.silence.start}–{props.silence.end}). Publicação suspensa até o fim da janela.
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {groups.length === 0 && <div className="card muted">Nada aprovado esperando publicação.</div>}

      {groups.map((group) => (
        <section key={group[0]!.categoryId} className="stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>{group[0]!.categoryName}</h2>
            <span className="badge">{group.length}</span>
            {group[0]!.channelUrl && (
              <a href={group[0]!.channelUrl} target="_blank" rel="noreferrer noopener">
                Abrir canal ↗
              </a>
            )}
          </div>
          {group.map((post) => {
            const key = `${post.offerId}:${post.categoryId}`;
            return (
              <div key={key} className="card stack">
                <pre className="post">{post.text}</pre>
                <div className="row">
                  <button type="button" className="primary" disabled={props.silent} onClick={() => copy(post)}>
                    {copied === key ? "Copiado ✓" : "Copiar"}
                  </button>
                  <button
                    type="button"
                    disabled={props.silent || busy}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await markPosted(post.offerId, post.categoryId, post.text);
                        if (!result.ok) return setError(result.error);
                        setError(null);
                        router.refresh();
                      })
                    }
                  >
                    Marcar como postado
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {props.removals.length > 0 && (
        <section className="stack">
          <h2>Remover do canal</h2>
          <p className="muted">Ofertas vencidas que ainda estão postadas. Apague o post no canal e marque aqui.</p>
          <table>
            <thead>
              <tr>
                <th>Oferta</th>
                <th>Canais</th>
                <th>Venceu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {props.removals.map((item) => (
                <tr key={item.offerId}>
                  <td>{item.title}</td>
                  <td>{item.channels.join(", ")}</td>
                  <td>{new Date(item.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await markRemoved(item.offerId);
                          if (!result.ok) return setError(result.error);
                          router.refresh();
                        })
                      }
                    >
                      Removido
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
