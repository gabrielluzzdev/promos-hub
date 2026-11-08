import type { Badge } from "@/lib/rules/evaluate";

export interface PostInput {
  title: string;
  priceCents: number;
  badge: Badge;
  discountVsAvgPct: number | null;
  condition: string | null;
  linkCode: string;
  domain: string;
}

/** "R$ 899", "R$ 1.249", "R$ 89,90". */
export function formatPrice(cents: number): string {
  const reais = cents / 100;
  const whole = Number.isInteger(reais);
  const number = reais.toLocaleString("pt-BR", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${number}`;
}

export function shortLink(domain: string, code: string): string {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/r/${code}`;
}

function priceLine(input: PostInput): string {
  const price = formatPrice(input.priceCents);
  if (input.badge === "lowest_90d") return `${price} · menor preço em 90 dias`;
  if (input.badge === "below_avg" && input.discountVsAvgPct !== null) {
    return `${price} (−${Math.round(input.discountVsAvgPct)}% vs média de 90 dias)`;
  }
  return price;
}

/**
 * Texto do post (SPEC seção 8). O preço "de" da loja nunca aparece,
 * porque não foi verificado por nós.
 */
export function formatPost(input: PostInput): string {
  const lines = [input.title.trim(), priceLine(input)];
  const condition = input.condition?.trim();
  if (condition) lines.push(condition);
  lines.push(shortLink(input.domain, input.linkCode));
  return lines.join("\n");
}
