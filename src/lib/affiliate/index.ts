import type { Store } from "@/lib/products/stores";

export interface AffiliateEnv {
  amazonAssociateTag?: string;
}

type Builder = (url: string, env: AffiliateEnv) => string | null;

const amazon: Builder = (url, env) => {
  if (!env.amazonAssociateTag) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)amazon\.com\.br$/i.test(parsed.hostname)) return null;
  parsed.searchParams.delete("tag");
  parsed.searchParams.set("tag", env.amazonAssociateTag);
  return parsed.toString();
};

/** Um montador por loja. Lojas sem montador: o revisor cola o link de afiliado na fila. */
const BUILDERS: Partial<Record<Store, Builder>> = { amazon };

export function hasAffiliateBuilder(store: Store): boolean {
  return store in BUILDERS;
}

export function buildAffiliateUrl(store: Store, url: string | null, env: AffiliateEnv): string | null {
  if (!url) return null;
  const builder = BUILDERS[store];
  return builder ? builder(url, env) : null;
}
