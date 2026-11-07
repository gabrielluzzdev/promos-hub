export type OperatorRole = "admin" | "curator";
export type Aal = "aal1" | "aal2" | null;

export type Access = { kind: "allow" } | { kind: "redirect"; to: string };

/**
 * Quem entra em /painel/*: precisa de login, MFA (aal2) e perfil de operador.
 * /painel/config é só para admin.
 */
export function decidePanelAccess(input: {
  path: string;
  hasUser: boolean;
  aal: Aal;
  role: OperatorRole | null;
}): Access {
  if (!input.hasUser) return { kind: "redirect", to: `/login?next=${encodeURIComponent(input.path)}` };
  if (input.aal !== "aal2") return { kind: "redirect", to: "/mfa" };
  if (!input.role) return { kind: "redirect", to: "/sem-acesso" };
  if (isAdminPath(input.path) && input.role !== "admin") return { kind: "redirect", to: "/painel" };
  return { kind: "allow" };
}

export function isAdminPath(path: string): boolean {
  return path === "/painel/config" || path.startsWith("/painel/config/");
}

/** Só aceita destino interno depois do login. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/painel";
  return next;
}
