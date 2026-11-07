export const STORES = [
  "amazon",
  "mercadolivre",
  "shopee",
  "magalu",
  "kabum",
  "casasbahia",
  "americanas",
  "other",
] as const;

export type Store = (typeof STORES)[number];

export const STORE_LABELS: Record<Store, string> = {
  amazon: "Amazon",
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  magalu: "Magalu",
  kabum: "KaBuM!",
  casasbahia: "Casas Bahia",
  americanas: "Americanas",
  other: "Outra loja",
};

const DOMAIN_TO_STORE: [RegExp, Store][] = [
  [/(^|\.)amazon\.com\.br$|(^|\.)amzn\.to$|(^|\.)a\.co$/, "amazon"],
  [/(^|\.)mercadolivre\.com(\.br)?$|(^|\.)mercadolibre\.com$|(^|\.)meli\.la$/, "mercadolivre"],
  [/(^|\.)shopee\.com\.br$|(^|\.)shope\.ee$/, "shopee"],
  [/(^|\.)magazineluiza\.com\.br$|(^|\.)magalu\.com(\.br)?$|(^|\.)divulgador\.magalu\.com$/, "magalu"],
  [/(^|\.)kabum\.com\.br$/, "kabum"],
  [/(^|\.)casasbahia\.com\.br$/, "casasbahia"],
  [/(^|\.)americanas\.com\.br$/, "americanas"],
];

/** Loja pelo domínio da URL; `null` quando a URL é inválida ou de loja desconhecida. */
export function storeFromUrl(url: string | null | undefined): Store | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [pattern, store] of DOMAIN_TO_STORE) {
    if (pattern.test(host)) return store;
  }
  return "other";
}
