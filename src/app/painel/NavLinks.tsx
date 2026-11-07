"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/painel/fila", label: "Fila" },
  { href: "/painel/entrada", label: "Entrada" },
  { href: "/painel/publicar", label: "Publicar" },
  { href: "/painel/hoje", label: "Hoje" },
  { href: "/painel/caixa", label: "Caixa" },
];

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/painel/config", label: "Configuração" }] : LINKS;
  return (
    <>
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </>
  );
}
