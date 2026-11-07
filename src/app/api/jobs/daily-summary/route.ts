import type { NextRequest } from "next/server";
import { runJob } from "@/lib/jobs/run";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 20:00 em São Paulo: guarda as ofertas com mais cliques do dia para /painel/hoje. */
export async function POST(request: NextRequest) {
  return runJob(request, "daily-summary", async () => {
    const db = createServiceClient();
    const { data: day, error: dayError } = await db.rpc("sp_today");
    if (dayError) throw new Error(dayError.message);
    const { data: top, error } = await db.rpc("top_offers", { p_day: day, p_limit: 10 });
    if (error) throw new Error(error.message);
    const { error: saveError } = await db
      .from("daily_summaries")
      .upsert({ day, top: top ?? [] }, { onConflict: "day" });
    if (saveError) throw new Error(saveError.message);
    return { day, offers: (top ?? []).length };
  });
}
