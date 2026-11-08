import Link from "next/link";
import { requireOperator } from "@/lib/auth/server";
import type { CategoryOption } from "@/lib/panel/types";
import { ManualForm, PasteForm } from "./EntryForms";

export const metadata = { title: "Entrada · Promos Hub" };

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; raw?: string }>;
}) {
  const { db } = await requireOperator({ path: "/painel/entrada" });
  const params = await searchParams;
  const mode = params.modo === "form" ? "form" : "paste";

  const { data: categories } = await db
    .from("categories")
    .select("id, slug, name")
    .eq("active", true)
    .order("sort_order")
    .returns<CategoryOption[]>();

  let rawText: string | null = null;
  if (mode === "form" && params.raw) {
    const { data } = await db
      .from("raw_inputs")
      .select("raw_text")
      .eq("id", params.raw)
      .maybeSingle<{ raw_text: string | null }>();
    rawText = data?.raw_text ?? null;
  }

  return (
    <div className="stack">
      <h1>Entrada de ofertas</h1>
      <div className="row">
        <Link className="button" href="/painel/entrada" aria-current={mode === "paste" ? "page" : undefined}>
          Colar texto
        </Link>
        <Link className="button" href="/painel/entrada?modo=form" aria-current={mode === "form" ? "page" : undefined}>
          Formulário
        </Link>
      </div>
      <div className="card">
        {mode === "paste" ? (
          <PasteForm />
        ) : (
          <ManualForm categories={categories ?? []} rawId={rawText ? (params.raw ?? null) : null} rawText={rawText} />
        )}
      </div>
    </div>
  );
}
