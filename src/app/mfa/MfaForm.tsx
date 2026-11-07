"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

type Stage =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

/**
 * MFA TOTP obrigatório. Sem fator verificado: cadastra (QR code). Com fator: pede o código.
 */
export function MfaForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setStage({ kind: "error", message: "Não foi possível carregar o MFA. Entre de novo." });
        return;
      }
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) {
        setStage({ kind: "verify", factorId: verified.id });
        return;
      }
      // Remove cadastros pela metade antes de começar outro.
      for (const factor of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `painel-${Date.now()}`,
      });
      if (enrollError || !enrolled) {
        setStage({ kind: "error", message: "Não foi possível iniciar o cadastro do MFA." });
        return;
      }
      setStage({ kind: "enroll", factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.kind !== "enroll" && stage.kind !== "verify") return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\D/g, "");
    setBusy(true);
    setError(null);
    const { error: verifyError } = await getBrowserClient().auth.mfa.challengeAndVerify({
      factorId: stage.factorId,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setError("Código inválido. Confira o horário do celular e tente o código atual.");
      return;
    }
    router.replace("/painel");
    router.refresh();
  }

  if (stage.kind === "loading") return <p className="muted">Carregando…</p>;
  if (stage.kind === "error") return <p className="error">{stage.message}</p>;

  return (
    <form onSubmit={onSubmit} className="stack">
      {stage.kind === "enroll" ? (
        <>
          <p>Escaneie no app autenticador (Google Authenticator, 1Password, Authy):</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qrCode} alt="QR code do MFA" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
          <p className="muted">
            Sem câmera? Use a chave: <code>{stage.secret}</code>
          </p>
        </>
      ) : (
        <p>Digite o código de 6 dígitos do app autenticador.</p>
      )}
      <label>
        <span>Código</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Conferindo…" : "Confirmar"}
      </button>
    </form>
  );
}
