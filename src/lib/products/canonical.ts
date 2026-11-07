import type { Store } from "./stores";

/** Minúsculas, sem acento, só letras/números separados por hífen. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ID_PATTERNS: Partial<Record<Store, RegExp[]>> = {
  amazon: [/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i],
  mercadolivre: [/\b(MLB-?\d{6,})\b/i, /\/p\/(MLB\d{6,})/i],
  shopee: [/-i\.(\d+\.\d+)/, /\/product\/(\d+)\/(\d+)/],
  magalu: [/\/p\/([a-z0-9]{6,})\//i],
  kabum: [/\/produto\/(\d+)/],
  casasbahia: [/\/(\d{6,})\/p(?:[/?]|$)/, /-(\d{6,})\.html/],
  americanas: [/\/produto\/(\d+)/],
};

/** Id do produto na loja a partir da URL, quando a URL traz um. */
export function storeProductId(store: Store, url: string | null | undefined): string | null {
  if (!url) return null;
  for (const pattern of ID_PATTERNS[store] ?? []) {
    const match = url.match(pattern);
    if (!match) continue;
    if (store === "shopee" && match[2]) return `${match[1]}.${match[2]}`;
    const id = match[1];
    if (!id) continue;
    if (store === "mercadolivre") return id.toUpperCase().replace("-", "");
    if (store === "amazon") return id.toUpperCase();
    return id.toLowerCase();
  }
  return null;
}

/**
 * Chave canônica determinística: id da loja quando a URL traz, senão marca + modelo,
 * senão o nome. Mesmo produto na mesma loja => mesma chave.
 */
export function canonicalKey(input: {
  store: Store;
  url?: string | null;
  name: string;
  brand?: string | null;
  model?: string | null;
}): string {
  const id = storeProductId(input.store, input.url);
  if (id) return id;
  if (input.model) {
    const key = slugify([input.brand, input.model].filter(Boolean).join(" "));
    if (key) return key;
  }
  return slugify(input.name).slice(0, 120) || "sem-nome";
}

/** URL sem parâmetros de rastreio, para guardar no produto. */
export function canonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}
