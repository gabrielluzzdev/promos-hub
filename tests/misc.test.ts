import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/jobs/auth";
import { isWindowOpen, maskPhone } from "@/lib/panel/window";
import { buildUserMessage } from "@/lib/parser";
import { RateLimiter } from "@/lib/rate-limit";

describe("jobs", () => {
  it("x-cron-secret precisa bater exatamente", () => {
    const secret = "s".repeat(40);
    expect(isCronAuthorized(secret, secret)).toBe(true);
    expect(isCronAuthorized(null, secret)).toBe(false);
    expect(isCronAuthorized("s".repeat(39), secret)).toBe(false);
    expect(isCronAuthorized(`${"s".repeat(39)}x`, secret)).toBe(false);
  });
});

describe("caixa de entrada", () => {
  const now = new Date("2026-11-07T15:00:00Z");
  it("janela de 24 h", () => {
    expect(isWindowOpen(new Date("2026-11-06T15:00:01Z"), now)).toBe(true);
    expect(isWindowOpen(new Date("2026-11-06T15:00:00Z"), now)).toBe(false);
    expect(isWindowOpen(null, now)).toBe(false);
  });

  it("número aparece mascarado", () => {
    expect(maskPhone("+5548999123400")).toBe("+55 48 9••••-••00");
  });
});

describe("parser", () => {
  it("mensagem do usuário no formato do SPEC", () => {
    expect(buildUserMessage("manual_text", "oferta")).toBe("source: manual_text\n<<<RAW\noferta\nRAW>>>");
  });
});

describe("rate limit", () => {
  it("bloqueia depois do limite e libera na janela seguinte", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 10)).toBe(true);
    expect(limiter.allow("ip", 20)).toBe(false);
    expect(limiter.allow("outro", 20)).toBe(true);
    expect(limiter.allow("ip", 1001)).toBe(true);
  });
});
