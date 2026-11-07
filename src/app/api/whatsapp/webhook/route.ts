import { after, type NextRequest } from "next/server";
import { handleInbound } from "@/lib/bot/engine";
import { SupabaseBotStore } from "@/lib/bot/supabase-store";
import { env } from "@/lib/env";
import { RateLimiter } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { GraphWhatsAppClient } from "@/lib/whatsapp/client";
import { extractInbound } from "@/lib/whatsapp/payload";
import { isValidSignature } from "@/lib/whatsapp/signature";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(120, 60_000);

/** Verificação do webhook no painel da Meta. */
export async function GET(request: NextRequest) {
  const { WA_VERIFY_TOKEN } = env("WA_VERIFY_TOKEN");
  const params = request.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === WA_VERIFY_TOKEN) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Eventos: valida a assinatura, responde 200 rápido e processa depois. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!limiter.allow(ip)) return new Response("too many requests", { status: 429 });

  const { WA_APP_SECRET } = env("WA_APP_SECRET");
  const rawBody = await request.text();
  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"), WA_APP_SECRET)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  after(async () => {
    const { messages, statusCount } = extractInbound(payload);
    if (statusCount) console.info(`[webhook] ${statusCount} status recebido(s)`);
    if (!messages.length) return;

    const config = env("WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_GRAPH_VERSION");
    const deps = {
      store: new SupabaseBotStore(createServiceClient()),
      wa: new GraphWhatsAppClient({
        phoneNumberId: config.WA_PHONE_NUMBER_ID,
        accessToken: config.WA_ACCESS_TOKEN,
        graphVersion: config.WA_GRAPH_VERSION,
      }),
    };
    for (const message of messages) {
      try {
        await handleInbound(message, deps);
      } catch (error) {
        // Sem telefone no log.
        console.error(`[webhook] falha ao processar ${message.id}:`, error instanceof Error ? error.message : error);
      }
    }
  });

  return new Response("ok", { status: 200 });
}
