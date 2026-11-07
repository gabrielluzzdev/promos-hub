import "server-only";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isCronAuthorized } from "./auth";

/** Envolve um job: checa o segredo, roda e responde JSON. */
export async function runJob(request: NextRequest, name: string, job: () => Promise<Record<string, unknown>>) {
  const { CRON_SECRET } = env("CRON_SECRET");
  if (!isCronAuthorized(request.headers.get("x-cron-secret"), CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const result = await job();
    return Response.json({ job: name, ok: true, ms: Date.now() - started, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[job ${name}] ${message}`);
    return Response.json({ job: name, ok: false, error: message }, { status: 500 });
  }
}
