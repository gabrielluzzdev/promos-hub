import type { NextRequest } from "next/server";
import { runJob } from "@/lib/jobs/run";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** A cada 15 min: aprovadas ou publicadas que passaram do prazo viram expiradas. */
export async function POST(request: NextRequest) {
  return runJob(request, "expire-offers", async () => {
    const { data, error } = await createServiceClient()
      .from("offers")
      .update({ status: "expired" })
      .in("status", ["approved", "published"])
      .lt("expires_at", new Date().toISOString())
      .select("id");
    if (error) throw new Error(error.message);
    return { expired: data?.length ?? 0 };
  });
}
