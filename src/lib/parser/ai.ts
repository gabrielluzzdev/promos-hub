import "server-only";
import { generateText, Output } from "ai";
import type { GenerateFn } from "./index";
import { parserOutputSchema } from "./schema";

/** Chamada ao modelo pelo AI SDK, com saída estruturada e temperatura 0. */
export function aiGenerate(model: string): GenerateFn {
  return async ({ system, prompt }) => {
    const result = await generateText({
      model,
      system,
      prompt,
      temperature: 0,
      output: Output.object({ schema: parserOutputSchema }),
    });
    return result.output;
  };
}
