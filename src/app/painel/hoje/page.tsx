import { requireOperator } from "@/lib/auth/server";
import { SendToGeneralButton } from "./SendToGeneralButton";

export const metadata = { title: "Hoje · Promos Hub" };

interface ChannelStat {
  category_id: string;
  slug: string;
  name: string;
  daily_min_posts: number;
  posts_count: number;
  clicks_count: number;
}

interface TopOffer {
  offer_id: string;
  post_title: string;
  category_id: string;
  status: string;
  send_to_general: boolean;
  clicks_count: number;
}

export default async function TodayPage() {
  const { db } = await requireOperator({ path: "/painel/hoje" });

  const { data: dayData } = await db.rpc("sp_today");
  const day = dayData as string | null;
  const [{ data: channelData }, { data: liveTopData }, { data: snapshot }] = await Promise.all([
    db.rpc("channel_stats", { p_day: day }),
    db.rpc("top_offers", { p_day: day, p_limit: 10 }),
    db.from("daily_summaries").select("top, created_at").eq("day", day).maybeSingle<{ top: TopOffer[]; created_at: string }>(),
  ]);

  const channels = channelData as ChannelStat[] | null;
  const liveTop = liveTopData as TopOffer[] | null;
  const top = snapshot?.top ?? liveTop ?? [];
  const names = new Map((channels ?? []).map((c) => [c.category_id, c.name]));
  const totalClicks = (channels ?? []).reduce((sum, c) => sum + c.clicks_count, 0);

  return (
    <div className="stack">
      <h1>Hoje</h1>
      <p className="muted">
        Dia {day ? new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR") : ""} · {totalClicks} cliques (sem robôs)
      </p>

      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th>Posts / mínimo</th>
            <th style={{ width: "30%" }} />
            <th>Cliques</th>
          </tr>
        </thead>
        <tbody>
          {(channels ?? []).map((c) => {
            const pct = c.daily_min_posts ? Math.min(100, Math.round((c.posts_count / c.daily_min_posts) * 100)) : 100;
            return (
              <tr key={c.category_id}>
                <td>{c.name}</td>
                <td className={c.posts_count < c.daily_min_posts ? "error" : undefined}>
                  {c.posts_count} / {c.daily_min_posts}
                </td>
                <td>
                  <div className="meter" aria-label={`${pct}% do mínimo`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td>{c.clicks_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Ofertas com mais cliques</h2>
      <p className="muted">
        {snapshot
          ? `Resumo das 20h (gerado às ${new Date(snapshot.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}).`
          : "Ao vivo. Às 20h, escolha as 3 melhores do dia para o Geral."}
      </p>
      {top.length === 0 ? (
        <div className="card muted">Ainda sem cliques hoje.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Oferta</th>
              <th>Canal</th>
              <th>Cliques</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {top.map((o) => (
              <tr key={o.offer_id}>
                <td>{o.post_title}</td>
                <td>{names.get(o.category_id) ?? "—"}</td>
                <td>{o.clicks_count}</td>
                <td>
                  {o.send_to_general ? (
                    <small className="muted">já no Geral</small>
                  ) : (
                    <SendToGeneralButton offerId={o.offer_id} disabled={!["approved", "published"].includes(o.status)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
