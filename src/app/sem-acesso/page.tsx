export const metadata = { title: "Sem acesso · Promos Hub" };

export default function NoAccessPage() {
  return (
    <main className="auth">
      <div className="card stack">
        <h1>Sem acesso ao painel</h1>
        <p>Sua conta não está cadastrada como operadora. Peça a um admin para incluir você em Configuração.</p>
        <form action="/auth/sair" method="post">
          <button type="submit">Sair</button>
        </form>
      </div>
    </main>
  );
}
