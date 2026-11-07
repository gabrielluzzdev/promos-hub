import { MfaForm } from "./MfaForm";

export const metadata = { title: "Verificação · Promos Hub" };

export default function MfaPage() {
  return (
    <main className="auth">
      <div className="card stack">
        <h1>Verificação em duas etapas</h1>
        <MfaForm />
        <form action="/auth/sair" method="post">
          <button type="submit">Sair</button>
        </form>
      </div>
    </main>
  );
}
