import type { Store } from "@/lib/products/stores";
import type { RuleConfig } from "./config";

export type RuleName =
  | "store_allowed"
  | "possible_scam"
  | "price_present"
  | "duplicate"
  | "history_sufficient"
  | "real_discount";

export type RuleOutcome = "pass" | "fail" | "warn";

export interface RuleResult {
  rule: RuleName;
  outcome: RuleOutcome;
  reason_ptbr: string;
}

export type Badge = "lowest_90d" | "below_avg" | "none";

export interface OfferInput {
  price_cents: number | null;
  flags: string[];
  /** Última aprovação de outra oferta do mesmo produto (mesma loja). */
  last_same_product_approved_at: Date | null;
}

export interface ProductInput {
  store: Store;
}

/** Estatística dos 90 dias anteriores à oferta (sem o preço da própria oferta). */
export interface PriceStats {
  min_90d: number | null;
  avg_90d: number | null;
  points: number;
  first_seen: Date | null;
}

export interface Evaluation {
  status: "rejected_auto" | "pending_review";
  results: RuleResult[];
  badge: Badge;
  discount_vs_avg_pct: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Regras da seção 7 do SPEC. Função pura: mesma entrada, mesma saída. */
export function evaluateOffer(
  offer: OfferInput,
  product: ProductInput,
  stats: PriceStats,
  config: RuleConfig,
  now: Date,
): Evaluation {
  const results: RuleResult[] = [];
  let rejected = false;

  // 1. Loja permitida
  const storeAllowed = product.store !== "other" && config.allowed_stores.includes(product.store);
  results.push(
    storeAllowed
      ? { rule: "store_allowed", outcome: "pass", reason_ptbr: "Loja permitida" }
      : { rule: "store_allowed", outcome: "fail", reason_ptbr: "Loja fora da lista de lojas permitidas" },
  );
  if (!storeAllowed) rejected = true;

  // 2. Possível golpe
  const scam = offer.flags.includes("possible_scam");
  results.push(
    scam
      ? { rule: "possible_scam", outcome: "fail", reason_ptbr: "Parser marcou como possível golpe" }
      : { rule: "possible_scam", outcome: "pass", reason_ptbr: "Sem sinal de golpe" },
  );
  if (scam) rejected = true;

  // 3. Preço presente
  const price = offer.price_cents;
  const hasPrice = price !== null && price > 0;
  results.push(
    hasPrice
      ? { rule: "price_present", outcome: "pass", reason_ptbr: "Preço informado" }
      : { rule: "price_present", outcome: "warn", reason_ptbr: "Sem preço: preencha antes de aprovar" },
  );

  // 4. Duplicata
  const last = offer.last_same_product_approved_at;
  const duplicate = last !== null && now.getTime() - last.getTime() < config.dup_block_days * DAY_MS;
  results.push(
    duplicate
      ? {
          rule: "duplicate",
          outcome: "fail",
          reason_ptbr: `Mesmo produto aprovado há menos de ${config.dup_block_days} dias`,
        }
      : { rule: "duplicate", outcome: "pass", reason_ptbr: "Sem oferta igual recente" },
  );
  if (duplicate) rejected = true;

  // 5. Histórico suficiente
  const historyDays = stats.first_seen ? (now.getTime() - stats.first_seen.getTime()) / DAY_MS : 0;
  const historyOk =
    stats.points >= config.badge_min_price_points &&
    historyDays >= config.badge_min_history_days &&
    stats.avg_90d !== null &&
    stats.min_90d !== null;
  results.push(
    historyOk
      ? { rule: "history_sufficient", outcome: "pass", reason_ptbr: `Histórico com ${stats.points} preços` }
      : {
          rule: "history_sufficient",
          outcome: "warn",
          reason_ptbr: "Histórico curto: conferir preço no Zoom/Buscapé",
        },
  );

  // 6. Desconto real (só com histórico suficiente e preço)
  let discount: number | null = null;
  if (historyOk && hasPrice && stats.avg_90d !== null) {
    discount = Math.round(((stats.avg_90d - price) / stats.avg_90d) * 1000) / 10;
    const real = discount >= config.min_discount_pct;
    results.push(
      real
        ? {
            rule: "real_discount",
            outcome: "pass",
            reason_ptbr: `${formatPct(discount)} abaixo da média de 90 dias (${brl(Math.round(stats.avg_90d))})`,
          }
        : {
            rule: "real_discount",
            outcome: "fail",
            reason_ptbr: `Só ${formatPct(discount)} abaixo da média de 90 dias; mínimo é ${config.min_discount_pct}%`,
          },
    );
    if (!real) rejected = true;
  }

  // 7. Selo
  let badge: Badge = "none";
  if (historyOk && hasPrice && discount !== null) {
    if (stats.min_90d !== null && price <= stats.min_90d) badge = "lowest_90d";
    else if (discount >= config.min_discount_pct) badge = "below_avg";
  }

  return {
    status: rejected ? "rejected_auto" : "pending_review",
    results,
    badge,
    discount_vs_avg_pct: discount,
  };
}

function formatPct(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
