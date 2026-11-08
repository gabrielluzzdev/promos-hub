import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decidePanelAccess, type Aal, type OperatorRole } from "@/lib/auth/access";

/**
 * Renova a sessão do Supabase e protege /painel/* (login + MFA aal2 + perfil de operador).
 * A RLS do banco exige aal2 de novo, então isto é a primeira camada, não a única.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path === "/mfa") {
    if (!user) return redirect(request, response, "/login?next=/painel");
    return response;
  }

  if (!path.startsWith("/painel")) return response;

  let aal: Aal = null;
  let role: OperatorRole | null = null;
  if (user) {
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = (level?.currentLevel as Aal) ?? null;
    const { data: profile } = await supabase
      .from("operator_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle<{ role: OperatorRole }>();
    role = profile?.role ?? null;
  }

  const access = decidePanelAccess({ path, hasUser: Boolean(user), aal, role });
  if (access.kind === "redirect") return redirect(request, response, access.to);
  return response;
}

function redirect(request: NextRequest, from: NextResponse, to: string) {
  const target = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of from.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  matcher: ["/painel/:path*", "/mfa"],
};
