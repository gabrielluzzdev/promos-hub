import { z } from "zod";

/**
 * Variáveis de ambiente do servidor (seção 12 do SPEC).
 * Validadas sob demanda, para o build não quebrar quando uma rota não precisa de todas.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  WA_ACCESS_TOKEN: z.string().min(1),
  WA_APP_SECRET: z.string().min(1),
  WA_VERIFY_TOKEN: z.string().min(1),
  WA_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, "formato esperado: v23.0"),
  AI_MODEL: z.string().min(1),
  AMAZON_ASSOCIATE_TAG: z.string().min(1),
  CRON_SECRET: z.string().min(32, "use pelo menos 32 caracteres"),
  PUBLIC_DOMAIN: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ServerEnvKey = keyof ServerEnv;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Variáveis de ambiente inválidas: ${problems}`);
  }
  return result.data;
}

/** Lê e valida só as variáveis pedidas. */
export function env<K extends ServerEnvKey>(...keys: K[]): Pick<ServerEnv, K> {
  const mask = Object.fromEntries(keys.map((k) => [k, true])) as Record<ServerEnvKey, true>;
  const result = serverSchema.pick(mask).safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variáveis de ambiente inválidas: ${problems}`);
  }
  return result.data as unknown as Pick<ServerEnv, K>;
}

/** Variável opcional (ex.: AMAZON_ASSOCIATE_TAG antes de ter conta aprovada). */
export function optionalEnv(key: ServerEnvKey): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}
