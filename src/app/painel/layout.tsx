import type { ReactNode } from "react";
import { requireOperator } from "@/lib/auth/server";
import { NavLinks } from "./NavLinks";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const operator = await requireOperator();
  return (
    <div className="shell">
      <nav className="nav" aria-label="Painel">
        <div className="brand">Promos Hub</div>
        <NavLinks isAdmin={operator.role === "admin"} />
        <div className="who">
          <div>{operator.displayName}</div>
          <small>{operator.role === "admin" ? "admin" : "curador"}</small>
          <form action="/auth/sair" method="post" style={{ marginTop: 8 }}>
            <button type="submit">Sair</button>
          </form>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
