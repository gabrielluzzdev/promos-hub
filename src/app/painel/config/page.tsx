import { requireOperator } from "@/lib/auth/server";
import { ruleConfigFromRows } from "@/lib/rules/config";
import { CategoryRow, NewOperatorForm, OperatorRow, RuleConfigForm } from "./ConfigForms";

export const metadata = { title: "Configuração · Promos Hub" };

export default async function ConfigPage() {
  const operator = await requireOperator({ admin: true, path: "/painel/config" });
  const { db } = operator;

  const [{ data: configRows }, { data: categories }, { data: operators }] = await Promise.all([
    db.from("rule_config").select("key, value"),
    db
      .from("categories")
      .select("id, slug, name, channel_url, daily_min_posts, active")
      .order("sort_order")
      .returns<{ id: string; slug: string; name: string; channel_url: string | null; daily_min_posts: number; active: boolean }[]>(),
    db
      .from("operator_profiles")
      .select("user_id, display_name, role")
      .order("display_name")
      .returns<{ user_id: string; display_name: string; role: "admin" | "curator" }[]>(),
  ]);

  return (
    <div className="stack">
      <h1>Configuração</h1>

      <h2>Regras</h2>
      <RuleConfigForm config={ruleConfigFromRows(configRows ?? [])} />

      <h2>Categorias e canais</h2>
      <p className="muted">O bot manda estes links para quem escolhe cada categoria. Categoria sem link aparece como &quot;link em breve&quot;.</p>
      {(categories ?? []).map((category) => (
        <CategoryRow key={category.id} category={category} />
      ))}

      <h2>Operadores</h2>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Papel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(operators ?? []).map((o) => (
            <OperatorRow key={o.user_id} operator={o} isSelf={o.user_id === operator.id} />
          ))}
        </tbody>
      </table>
      <NewOperatorForm />
    </div>
  );
}
