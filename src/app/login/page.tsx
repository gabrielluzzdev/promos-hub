import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar · Promos Hub" };

export default function LoginPage() {
  return (
    <main className="auth">
      <div className="card stack">
        <h1>Painel de ofertas</h1>
        <p className="muted">Acesso só para operadores. Depois da senha, o código do app autenticador.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
