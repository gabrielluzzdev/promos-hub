export const APP_TIME_ZONE = "America/Sao_Paulo";

/** Minutos desde a meia-noite no fuso informado. */
export function minutesOfDay(date: Date, timeZone: string = APP_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function toMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Horário de silêncio: início incluso, fim excluído. Atravessa a meia-noite quando start > end.
 * Nunca rejeita oferta; só segura a publicação.
 */
export function isSilent(
  now: Date,
  silence: { start: string; end: string },
  timeZone: string = APP_TIME_ZONE,
): boolean {
  const current = minutesOfDay(now, timeZone);
  const start = toMinutes(silence.start);
  const end = toMinutes(silence.end);
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}
