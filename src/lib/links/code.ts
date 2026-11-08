import { randomInt } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Código base62 de 6 caracteres (~56 bilhões de combinações). */
export function newLinkCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function isLinkCode(value: string): boolean {
  return /^[0-9A-Za-z]{6}$/.test(value);
}
