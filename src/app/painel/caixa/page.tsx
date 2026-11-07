import { requireOperator } from "@/lib/auth/server";
import { isWindowOpen, maskPhone } from "@/lib/panel/window";
import { InboxItem } from "./InboxItem";

export const metadata = { title: "Caixa · Promos Hub" };

interface Row {
  id: string;
  text: string;
  received_at: string;
  answered_at: string | null;
  answer_text: string | null;
  users: { phone_e164: string; last_contact_at: string | null } | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function InboxPage() {
  const { db } = await requireOperator({ path: "/painel/caixa" });
  const select = "id, text, received_at, answered_at, answer_text, users!inbox_messages_user_id_fkey(phone_e164, last_contact_at)";
  const [{ data: open }, { data: answered }] = await Promise.all([
    db.from("inbox_messages").select(select).is("answered_at", null).order("received_at").limit(100).returns<Row[]>(),
    db
      .from("inbox_messages")
      .select(select)
      .not("answered_at", "is", null)
      .order("answered_at", { ascending: false })
      .limit(20)
      .returns<Row[]>(),
  ]);
  // Horário da requisição, fixo para a página toda.
  const now = new Date();

  return (
    <div className="stack">
      <h1>Caixa de entrada</h1>
      <p className="muted">
        Mensagens que o bot não entendeu. Responda dentro de 24 h da última mensagem da pessoa; depois disso o WhatsApp não deixa.
      </p>
      {(open ?? []).length === 0 && <div className="card muted">Nada para responder.</div>}
      {(open ?? []).map((m) => (
        <InboxItem
          key={m.id}
          id={m.id}
          who={m.users ? maskPhone(m.users.phone_e164) : "pessoa saiu"}
          text={m.text}
          receivedAt={when(m.received_at)}
          windowOpen={isWindowOpen(m.users?.last_contact_at ? new Date(m.users.last_contact_at) : null, now)}
        />
      ))}

      {(answered ?? []).length > 0 && (
        <>
          <h2>Resolvidas recentemente</h2>
          <table>
            <thead>
              <tr>
                <th>Recebida</th>
                <th>Mensagem</th>
                <th>Resposta</th>
              </tr>
            </thead>
            <tbody>
              {(answered ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{when(m.received_at)}</td>
                  <td>{m.text}</td>
                  <td>{m.answer_text ?? <small className="muted">resolvida sem resposta</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
