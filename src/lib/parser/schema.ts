import { z } from "zod";
import { STORES } from "@/lib/products/stores";

export const CATEGORY_SLUGS = ["tecnologia", "games", "casa", "moda", "livros_papelaria", "beleza"] as const;

export const PARSER_FLAGS = [
  "possible_scam",
  "missing_price",
  "expired",
  "used_or_refurbished",
  "international_shipping",
  "price_unclear",
] as const;

export const parsedOfferSchema = z.object({
  store: z.enum(STORES).describe("Loja. Use other se não for uma das listadas."),
  product_name: z.string().describe("Nome do produto como aparece, sem emojis."),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  url: z.string().nullable().describe("Link do produto exatamente como no texto."),
  price_current: z.number().nullable().describe("Preço atual em reais, ex.: 899.9. null se não houver."),
  price_claimed_before: z.number().nullable().describe("Preço 'de' anunciado, em reais. null se não houver."),
  coupon: z.string().nullable(),
  conditions: z.string().nullable().describe("Condições: só no app, frete, parcelamento, limite por CPF etc."),
  category_slug: z.enum(CATEGORY_SLUGS).nullable(),
  post_title: z.string().describe("Título curto para o post, até 60 caracteres, sem emojis."),
  post_condition: z.string().nullable().describe("Uma linha curta com cupom ou condição importante, ou null."),
  flags: z.array(z.enum(PARSER_FLAGS)),
});

export const parserOutputSchema = z.object({
  offers: z.array(parsedOfferSchema).describe("No máximo 10 ofertas."),
});

export type ParsedOffer = z.infer<typeof parsedOfferSchema>;
export type ParserOutput = z.infer<typeof parserOutputSchema>;
