import { timingSafeEqual } from "node:crypto";

/** Confere o header x-cron-secret enviado pelo Supabase Cron. */
export function isCronAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
