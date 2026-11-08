import { describe, expect, it } from "vitest";
import { buildAffiliateUrl, hasAffiliateBuilder } from "@/lib/affiliate";
import { isLinkCode, newLinkCode } from "@/lib/links/code";
import { deviceFromUserAgent, isBotUserAgent } from "@/lib/links/user-agent";
import { formatPost, formatPrice } from "@/lib/post/format";
import { canonicalKey, canonicalUrl, storeProductId } from "@/lib/products/canonical";
import { storeFromUrl } from "@/lib/products/stores";

describe("formatPost", () => {
  const base = {
    title: "Monitor LG 27\" IPS 144Hz",
    priceCents: 89900,
    discountVsAvgPct: 28.4,
    condition: "Cupom LG10 no carrinho",
    linkCode: "x7K2aB",
    domain: "ofertas.com.br",
  };

  it("selo de menor preço", () => {
    expect(formatPost({ ...base, badge: "lowest_90d" })).toBe(
      ["Monitor LG 27\" IPS 144Hz", "R$ 899 · menor preço em 90 dias", "Cupom LG10 no carrinho", "https://ofertas.com.br/r/x7K2aB"].join("\n"),
    );
  });

  it("selo abaixo da média com sinal de menos", () => {
    expect(formatPost({ ...base, badge: "below_avg" }).split("\n")[1]).toBe("R$ 899 (−28% vs média de 90 dias)");
  });

  it("sem selo não promete desconto e omite condição vazia", () => {
    expect(formatPost({ ...base, badge: "none", condition: null })).toBe(
      ["Monitor LG 27\" IPS 144Hz", "R$ 899", "https://ofertas.com.br/r/x7K2aB"].join("\n"),
    );
    expect(formatPost({ ...base, badge: "none", condition: "  " }).split("\n")).toHaveLength(3);
  });

  it("aceita domínio com https e barra no fim", () => {
    expect(formatPost({ ...base, badge: "none", domain: "https://ofertas.com.br/" })).toContain("https://ofertas.com.br/r/x7K2aB");
  });

  it.each([
    [89900, "R$ 899"],
    [124900, "R$ 1.249"],
    [8990, "R$ 89,90"],
    [5, "R$ 0,05"],
  ])("formatPrice(%d) = %s", (cents, text) => {
    expect(formatPrice(cents)).toBe(text);
  });
});

describe("links", () => {
  it("gera códigos base62 de 6 caracteres", () => {
    const codes = new Set(Array.from({ length: 500 }, newLinkCode));
    expect(codes.size).toBe(500);
    expect([...codes].every(isLinkCode)).toBe(true);
    expect(isLinkCode("abc")).toBe(false);
    expect(isLinkCode("abc-12")).toBe(false);
  });

  it.each([
    ["WhatsApp/2.23.20.0", true],
    ["facebookexternalhit/1.1", true],
    ["TelegramBot (like TwitterBot)", true],
    ["Slackbot-LinkExpanding 1.0", true],
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", true],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", false],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", false],
    ["", true],
  ])("isBotUserAgent(%s) = %s", (ua, expected) => {
    expect(isBotUserAgent(ua)).toBe(expected);
  });

  it("detecta o dispositivo", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14) Mobile Safari")).toBe("mobile");
    expect(deviceFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("desktop");
    expect(deviceFromUserAgent(null)).toBe("unknown");
  });
});

describe("produtos e afiliados", () => {
  it.each([
    ["https://www.amazon.com.br/dp/B0CHX3QBCH?ref=x", "amazon"],
    ["https://produto.mercadolivre.com.br/MLB-123456789-monitor", "mercadolivre"],
    ["https://shopee.com.br/Fone-i.123.456", "shopee"],
    ["https://www.magazineluiza.com.br/x/p/abc123def/", "magalu"],
    ["https://www.kabum.com.br/produto/12345/x", "kabum"],
    ["https://loja-desconhecida.com/x", "other"],
    ["não é url", null],
  ])("storeFromUrl(%s) = %s", (url, store) => {
    expect(storeFromUrl(url)).toBe(store);
  });

  it("extrai o id do produto da URL", () => {
    expect(storeProductId("amazon", "https://www.amazon.com.br/Monitor/dp/b0chx3qbch/ref=sr")).toBe("B0CHX3QBCH");
    expect(storeProductId("mercadolivre", "https://produto.mercadolivre.com.br/MLB-123456789-monitor")).toBe("MLB123456789");
    expect(storeProductId("shopee", "https://shopee.com.br/Fone-i.123.456")).toBe("123.456");
    expect(storeProductId("kabum", "https://www.kabum.com.br/produto/12345/x")).toBe("12345");
    expect(storeProductId("amazon", null)).toBeNull();
  });

  it("chave canônica: id da loja, senão marca + modelo, senão nome", () => {
    expect(canonicalKey({ store: "amazon", url: "https://www.amazon.com.br/dp/B0CHX3QBCH", name: "x" })).toBe("B0CHX3QBCH");
    expect(canonicalKey({ store: "shopee", name: "Fone", brand: "JBL", model: "Tune 520BT" })).toBe("jbl-tune-520bt");
    expect(canonicalKey({ store: "shopee", name: "Fone Bluetooth Ótimo!" })).toBe("fone-bluetooth-otimo");
  });

  it("URL canônica sem rastreio", () => {
    expect(canonicalUrl("https://www.amazon.com.br/dp/B0CHX3QBCH?tag=x&ref=y#a")).toBe("https://www.amazon.com.br/dp/B0CHX3QBCH");
  });

  it("Amazon recebe a tag de associado (substituindo outra)", () => {
    const url = buildAffiliateUrl("amazon", "https://www.amazon.com.br/dp/B0CHX3QBCH?tag=concorrente-20", {
      amazonAssociateTag: "nossa-20",
    });
    expect(url).toBe("https://www.amazon.com.br/dp/B0CHX3QBCH?tag=nossa-20");
  });

  it("lojas sem montador devolvem null (revisor cola o link)", () => {
    expect(hasAffiliateBuilder("shopee")).toBe(false);
    expect(buildAffiliateUrl("shopee", "https://shopee.com.br/x-i.1.2", {})).toBeNull();
    expect(buildAffiliateUrl("amazon", "https://www.amazon.com.br/dp/B0CHX3QBCH", {})).toBeNull();
  });
});
