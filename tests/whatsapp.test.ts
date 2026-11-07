import { describe, expect, it } from "vitest";
import { parseCommand, parsePick } from "@/lib/bot/commands";
import { extractInbound } from "@/lib/whatsapp/payload";
import { isValidSignature, signBody } from "@/lib/whatsapp/signature";

describe("assinatura do webhook", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("aceita a assinatura correta", () => {
    expect(isValidSignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it("recusa assinatura ausente, malformada, de outro segredo ou corpo alterado", () => {
    expect(isValidSignature(body, null, secret)).toBe(false);
    expect(isValidSignature(body, "abc", secret)).toBe(false);
    expect(isValidSignature(body, signBody(body, "outro"), secret)).toBe(false);
    expect(isValidSignature(`${body} `, signBody(body, secret), secret)).toBe(false);
  });
});

describe("leitura do payload", () => {
  const payload = (messages: unknown[], statuses: unknown[] = []) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages, statuses } }] }],
  });

  it("lê texto, lista, botão e referral de anúncio", () => {
    const { messages } = extractInbound(
      payload([
        { id: "m1", from: "55", timestamp: "1794000000", type: "text", text: { body: "quero" }, referral: { ctwa_clid: "x" } },
        { id: "m2", from: "55", timestamp: "1794000001", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "cat:a", title: "1. A" } } },
        { id: "m3", from: "55", timestamp: "1794000002", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "btn:done", title: "Pronto" } } },
        { id: "m4", from: "55", timestamp: "1794000003", type: "image" },
      ]),
    );
    expect(messages.map((m) => [m.id, m.kind, m.replyId ?? m.text ?? null])).toEqual([
      ["m1", "text", "quero"],
      ["m2", "list_reply", "cat:a"],
      ["m3", "button_reply", "btn:done"],
      ["m4", "other", null],
    ]);
    expect(messages[0]!.referral).toEqual({ ctwaClid: "x" });
    expect(messages[0]!.receivedAt.toISOString()).toBe(new Date(1794000000 * 1000).toISOString());
  });

  it("conta status e ignora payload de outro objeto", () => {
    expect(extractInbound(payload([], [{ id: "s1" }, { id: "s2" }])).statusCount).toBe(2);
    expect(extractInbound({ object: "page" }).messages).toEqual([]);
  });
});

describe("comandos e escolhas", () => {
  it.each([
    ["sair", "SAIR"],
    ["Sair.", "SAIR"],
    ["CATEGORIAS", "CATEGORIAS"],
    ["categória", "CATEGORIAS"],
    ["ajuda?", "AJUDA"],
    ["pausar", "PAUSAR"],
    ["quero", "QUERO"],
    ["sair do grupo", null],
  ])("'%s' -> %s", (text, expected) => {
    expect(parseCommand(text)).toBe(expected);
  });

  it.each([
    ["1,3,5", [1, 3, 5]],
    ["1 3 5", [1, 3, 5]],
    ["1 e 3", [1, 3]],
    ["2", [2]],
    ["3, 3", [3]],
  ])("'%s' -> %j", (text, numbers) => {
    expect(parsePick(text)).toEqual({ kind: "numbers", numbers });
  });

  it("'todas' e textos que não são escolha", () => {
    expect(parsePick("TODAS")).toEqual({ kind: "all" });
    expect(parsePick("quero 2")).toBeNull();
    expect(parsePick("oi")).toBeNull();
  });
});
