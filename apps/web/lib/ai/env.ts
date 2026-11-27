import "server-only";
import { z } from "zod";

// Read when a call is made, never at import time, so `next build` passes
// without the key set. Server only (project.md §9): never in NEXT_PUBLIC_*.

const geminiEnvSchema = z.object({ GEMINI_API_KEY: z.string().min(1) });

export type GeminiEnv = z.infer<typeof geminiEnvSchema>;

/** Throws a clear error when GEMINI_API_KEY is missing or blank. */
export function readGeminiEnv(
  values: Record<string, string | undefined> = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },
): GeminiEnv {
  const key = values.GEMINI_API_KEY?.trim();
  const result = geminiEnvSchema.safeParse({
    GEMINI_API_KEY: key === "" ? undefined : key,
  });
  if (!result.success) {
    throw new Error(
      "Gemini env: GEMINI_API_KEY is not set (server-only key from Google AI Studio)",
    );
  }
  return result.data;
}
