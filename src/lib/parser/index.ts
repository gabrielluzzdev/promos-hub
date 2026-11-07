import { readFile } from "node:fs/promises";
import path from "node:path";
import { parserOutputSchema, type ParsedOffer, type ParserOutput } from "./schema";

export type GenerateFn = (input: { system: string; prompt: string }) => Promise<ParserOutput>;

export const MAX_OFFERS_PER_INPUT = 10;

let cachedPrompt: string | undefined;

/** Prompt do sistema em prompts/offer-parser.md (o time edita sem mexer no código). */
export async function loadSystemPrompt(): Promise<string> {
  cachedPrompt ??= await readFile(path.join(process.cwd(), "prompts", "offer-parser.md"), "utf8");
  return cachedPrompt;
}

export function buildUserMessage(source: string, text: string): string {
  return `source: ${source}\n<<<RAW\n${text}\nRAW>>>`;
}

/** Uma tentativa e uma repetição; depois disso o erro sobe para quem chamou marcar `failed`. */
export async function parseOffers(input: {
  text: string;
  source: string;
  system: string;
  generate: GenerateFn;
}): Promise<ParsedOffer[]> {
  const prompt = buildUserMessage(input.source, input.text);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const output = parserOutputSchema.parse(await input.generate({ system: input.system, prompt }));
      return output.offers.slice(0, MAX_OFFERS_PER_INPUT);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Reais (número) para centavos; descarta valores inválidos. */
export function toCents(reais: number | null | undefined): number | null {
  if (reais === null || reais === undefined || !Number.isFinite(reais) || reais <= 0) return null;
  return Math.round(reais * 100);
}
