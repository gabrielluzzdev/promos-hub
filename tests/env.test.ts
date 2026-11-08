import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  WA_PHONE_NUMBER_ID: "123",
  WA_ACCESS_TOKEN: "token",
  WA_APP_SECRET: "secret",
  WA_VERIFY_TOKEN: "verify",
  WA_GRAPH_VERSION: "v23.0",
  AI_MODEL: "anthropic/claude-haiku-4.5",
  AMAZON_ASSOCIATE_TAG: "tag-20",
  CRON_SECRET: "x".repeat(32),
  PUBLIC_DOMAIN: "example.com.br",
};

describe("parseServerEnv", () => {
  it("aceita um ambiente completo", () => {
    expect(parseServerEnv(valid).WA_GRAPH_VERSION).toBe("v23.0");
  });

  it("lista todas as variáveis faltando na mensagem de erro", () => {
    expect(() => parseServerEnv({ ...valid, WA_APP_SECRET: undefined, CRON_SECRET: "curto" })).toThrow(
      /WA_APP_SECRET.*CRON_SECRET|CRON_SECRET.*WA_APP_SECRET/,
    );
  });

  it("recusa versão do Graph fora do formato", () => {
    expect(() => parseServerEnv({ ...valid, WA_GRAPH_VERSION: "23" })).toThrow(/WA_GRAPH_VERSION/);
  });
});
