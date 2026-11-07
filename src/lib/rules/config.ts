import { z } from "zod";
import { STORES, type Store } from "@/lib/products/stores";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");

export const ruleConfigSchema = z.object({
  min_discount_pct: z.number().min(0).max(100),
  dup_block_days: z.number().int().min(0),
  allowed_stores: z.array(z.enum(STORES)),
  silence: z.object({ start: timeOfDay, end: timeOfDay }),
  offer_ttl_hours: z.number().int().min(1),
  badge_min_history_days: z.number().int().min(0),
  badge_min_price_points: z.number().int().min(1),
});

export type RuleConfig = z.infer<typeof ruleConfigSchema>;

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  min_discount_pct: 15,
  dup_block_days: 7,
  allowed_stores: ["amazon", "mercadolivre", "shopee", "magalu", "kabum", "casasbahia", "americanas"] satisfies Store[],
  silence: { start: "23:00", end: "08:00" },
  offer_ttl_hours: 24,
  badge_min_history_days: 30,
  badge_min_price_points: 5,
};

export type RuleConfigKey = keyof RuleConfig;
export const RULE_CONFIG_KEYS = Object.keys(DEFAULT_RULE_CONFIG) as RuleConfigKey[];

/** Monta a configuração a partir das linhas de rule_config; chave ausente usa o padrão. */
export function ruleConfigFromRows(rows: { key: string; value: unknown }[]): RuleConfig {
  const merged: Record<string, unknown> = { ...DEFAULT_RULE_CONFIG };
  for (const row of rows) {
    if ((RULE_CONFIG_KEYS as string[]).includes(row.key)) merged[row.key] = row.value;
  }
  return ruleConfigSchema.parse(merged);
}

/** Valida uma única chave (usado na página de configuração). */
export function parseRuleConfigValue(key: RuleConfigKey, value: unknown): unknown {
  return ruleConfigSchema.shape[key].parse(value);
}
