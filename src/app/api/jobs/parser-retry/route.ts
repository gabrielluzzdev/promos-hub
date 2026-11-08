import type { NextRequest } from "next/server";
import { parserDeps } from "@/lib/intake/deps";
import { processRawInput } from "@/lib/intake/pipeline";
import { runJob } from "@/lib/jobs/run";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A cada 5 min: textos pendentes (esquecidos) ou com falha e menos de 2 tentativas. */
export async function POST(request: NextRequest) {
  return runJob(request, "parser-retry", async () => {
    const db = createServiceClient();
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("raw_inputs")
      .select("id")
      .lt("attempts", 2)
      .or(`status.eq.failed,and(status.eq.pending,created_at.lt.${staleBefore})`)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);

    const deps = parserDeps();
    const results = { parsed: 0, failed: 0, offers: 0 };
    for (const row of data ?? []) {
      const result = await processRawInput(row.id as string, deps);
      if (result.status === "parsed") results.parsed++;
      if (result.status === "failed") results.failed++;
      results.offers += result.offers;
    }
    return results;
  });
}
