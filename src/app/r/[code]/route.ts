import { after, type NextRequest } from "next/server";
import { isLinkCode } from "@/lib/links/code";
import { deviceFromUserAgent, isBotUserAgent } from "@/lib/links/user-agent";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Redireciona para o link de afiliado real da loja e conta o clique depois, sem atrasar. */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const db = createServiceClient();

  const link = isLinkCode(code)
    ? (
        await db
          .from("links")
          .select("code, destination_url, category_id")
          .eq("code", code)
          .maybeSingle<{ code: string; destination_url: string; category_id: string }>()
      ).data
    : null;

  if (!link) return notFoundPage(db);

  const userAgent = request.headers.get("user-agent");
  after(async () => {
    const { error } = await db.from("clicks").insert({
      link_code: link.code,
      category_id: link.category_id,
      device: deviceFromUserAgent(userAgent),
      user_agent: userAgent?.slice(0, 400) ?? null,
      is_bot: isBotUserAgent(userAgent),
    });
    if (error) console.error(`[r] falha ao registrar clique: ${error.message}`);
  });

  return new Response(null, { status: 302, headers: { ...NO_STORE, Location: link.destination_url } });
}

async function notFoundPage(db: ReturnType<typeof createServiceClient>) {
  const { data: general } = await db
    .from("categories")
    .select("channel_url")
    .eq("slug", "geral")
    .maybeSingle<{ channel_url: string | null }>();
  const channel = general?.channel_url;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Oferta não encontrada</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f6f3;color:#1c1c1a;padding:16px}
main{max-width:420px;text-align:center}a{display:inline-block;margin-top:12px;padding:10px 16px;border-radius:8px;background:#0f7b5f;color:#fff;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){body{background:#141413;color:#ecebe6}}</style></head>
<body><main><h1>Essa oferta não existe mais</h1>
<p>O link pode ter expirado ou estar incompleto. As ofertas novas estão no nosso canal.</p>
${channel ? `<a href="${escapeAttr(channel)}">Ver o canal Geral</a>` : ""}
</main></body></html>`;
  return new Response(html, { status: 404, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
