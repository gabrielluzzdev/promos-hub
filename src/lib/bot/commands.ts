export type Command = "CATEGORIAS" | "PAUSAR" | "SAIR" | "AJUDA" | "QUERO";

/** Maiúsculas, sem acento, sem pontuação nas pontas. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "")
    .replace(/\s+/g, " ");
}

export function parseCommand(text: string): Command | null {
  const normalized = normalizeText(text);
  switch (normalized) {
    case "CATEGORIAS":
    case "CATEGORIA":
      return "CATEGORIAS";
    case "PAUSAR":
    case "PAUSA":
      return "PAUSAR";
    case "SAIR":
      return "SAIR";
    case "AJUDA":
      return "AJUDA";
    case "QUERO":
      return "QUERO";
    default:
      return null;
  }
}

export type Pick = { kind: "numbers"; numbers: number[] } | { kind: "all" };

/**
 * Escolha digitada: "1,3,5", "1 3 5", "1, 3 e 5", "todas".
 * Retorna null quando o texto não é uma escolha.
 */
export function parsePick(text: string): Pick | null {
  const normalized = normalizeText(text);
  if (normalized === "TODAS" || normalized === "TODOS") return { kind: "all" };
  if (!/^\d+(?:\s*(?:,|;|\bE\b|\s)\s*\d+)*$/.test(normalized)) return null;
  const numbers = [...new Set(normalized.match(/\d+/g)!.map(Number))];
  return { kind: "numbers", numbers };
}
