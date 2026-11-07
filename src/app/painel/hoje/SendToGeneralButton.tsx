"use client";

import { useState, useTransition } from "react";
import { sendToGeneral } from "./actions";

export function SendToGeneralButton({ offerId, disabled }: { offerId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  if (result) return <small className="notice">{result}</small>;
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const r = await sendToGeneral(offerId);
          setResult(r.ok ? "Enviada ✓" : r.error);
        })
      }
    >
      Enviar ao Geral
    </button>
  );
}
