"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dismissInbox, replyInbox } from "./actions";

export function InboxItem(props: {
  id: string;
  who: string;
  text: string;
  receivedAt: string;
  windowOpen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card stack">
      <div className="row">
        <strong>{props.who}</strong>
        <small className="muted">{props.receivedAt}</small>
        <span className="spacer" />
        <span className={props.windowOpen ? "badge ok" : "badge fail"}>{props.windowOpen ? "janela aberta" : "janela fechada"}</span>
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{props.text}</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const text = String(new FormData(form).get("reply") ?? "");
          startTransition(async () => {
            const result = await replyInbox(props.id, text);
            if (!result.ok) return setError(result.error);
            form.reset();
            router.refresh();
          });
        }}
      >
        <textarea name="reply" rows={2} placeholder={props.windowOpen ? "Resposta" : "Janela fechada"} disabled={!props.windowOpen} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={!props.windowOpen || pending}>
            Responder
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await dismissInbox(props.id);
                if (!result.ok) return setError(result.error);
                router.refresh();
              })
            }
          >
            Resolver sem responder
          </button>
        </div>
      </form>
    </div>
  );
}
