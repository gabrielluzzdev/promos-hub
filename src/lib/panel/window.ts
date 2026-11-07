const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Janela de atendimento de 24 h aberta pela última mensagem da pessoa. */
export function isWindowOpen(lastContactAt: Date | null, now: Date): boolean {
  if (!lastContactAt) return false;
  return now.getTime() - lastContactAt.getTime() < WINDOW_MS;
}

/** "+55 48 9••••-••00": o painel não mostra o número inteiro. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 5)}••••-••${digits.slice(-2)}`;
}
