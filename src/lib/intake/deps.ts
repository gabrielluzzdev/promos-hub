import "server-only";
import { env, optionalEnv } from "@/lib/env";
import { loadSystemPrompt } from "@/lib/parser";
import { aiGenerate } from "@/lib/parser/ai";
import { createServiceClient } from "@/lib/supabase/server";
import type { IntakeDeps } from "./pipeline";
import { SupabaseIntakeRepo } from "./supabase-repo";

export function intakeDeps(): IntakeDeps {
  return {
    repo: new SupabaseIntakeRepo(createServiceClient()),
    affiliate: { amazonAssociateTag: optionalEnv("AMAZON_ASSOCIATE_TAG") },
    now: () => new Date(),
  };
}

export function parserDeps() {
  const { AI_MODEL } = env("AI_MODEL");
  return { ...intakeDeps(), generate: aiGenerate(AI_MODEL), systemPrompt: loadSystemPrompt };
}
