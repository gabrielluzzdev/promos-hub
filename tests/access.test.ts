import { describe, expect, it } from "vitest";
import { decidePanelAccess, safeNext } from "@/lib/auth/access";

describe("acesso ao painel", () => {
  it("sem login vai para /login com o destino", () => {
    expect(decidePanelAccess({ path: "/painel/fila", hasUser: false, aal: null, role: null })).toEqual({
      kind: "redirect",
      to: "/login?next=%2Fpainel%2Ffila",
    });
  });

  it("curador sem MFA não chega ao /painel", () => {
    expect(decidePanelAccess({ path: "/painel", hasUser: true, aal: "aal1", role: "curator" })).toEqual({
      kind: "redirect",
      to: "/mfa",
    });
  });

  it("admin sem MFA também não", () => {
    expect(decidePanelAccess({ path: "/painel/config", hasUser: true, aal: "aal1", role: "admin" })).toEqual({
      kind: "redirect",
      to: "/mfa",
    });
  });

  it("login com MFA mas sem perfil de operador vai para /sem-acesso", () => {
    expect(decidePanelAccess({ path: "/painel", hasUser: true, aal: "aal2", role: null })).toEqual({
      kind: "redirect",
      to: "/sem-acesso",
    });
  });

  it("admin vê /painel/config e curador não", () => {
    expect(decidePanelAccess({ path: "/painel/config", hasUser: true, aal: "aal2", role: "admin" })).toEqual({ kind: "allow" });
    expect(decidePanelAccess({ path: "/painel/config", hasUser: true, aal: "aal2", role: "curator" })).toEqual({
      kind: "redirect",
      to: "/painel",
    });
    expect(decidePanelAccess({ path: "/painel/configuracoes", hasUser: true, aal: "aal2", role: "curator" })).toEqual({
      kind: "allow",
    });
  });

  it("curador com MFA usa o resto do painel", () => {
    for (const path of ["/painel", "/painel/fila", "/painel/entrada", "/painel/publicar", "/painel/hoje", "/painel/caixa"]) {
      expect(decidePanelAccess({ path, hasUser: true, aal: "aal2", role: "curator" })).toEqual({ kind: "allow" });
    }
  });

  it("safeNext só aceita caminho interno", () => {
    expect(safeNext("/painel/fila")).toBe("/painel/fila");
    expect(safeNext("https://malicioso.com")).toBe("/painel");
    expect(safeNext("//malicioso.com")).toBe("/painel");
    expect(safeNext(null)).toBe("/painel");
  });
});
