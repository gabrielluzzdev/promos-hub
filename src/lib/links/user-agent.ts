export type Device = "mobile" | "desktop" | "unknown";

/**
 * Robôs de pré-visualização de link. O WhatsApp busca o link para montar a prévia,
 * então sem isso a contagem de cliques infla. Métricas excluem is_bot.
 */
const BOT_PATTERN = /WhatsApp|facebookexternalhit|TelegramBot|Twitterbot|Slackbot|bot|crawler|spider/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

export function deviceFromUserAgent(userAgent: string | null | undefined): Device {
  if (!userAgent) return "unknown";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) return "mobile";
  if (/Windows|Macintosh|Linux|X11|CrOS/i.test(userAgent)) return "desktop";
  return "unknown";
}
