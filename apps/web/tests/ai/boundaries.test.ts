import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The AI module holds GEMINI_API_KEY: it must never reach the browser.
const AI_DIR = join(import.meta.dirname, "../../lib/ai");
const files = readdirSync(AI_DIR).filter((f) => f.endsWith(".ts"));

describe("lib/ai is server only", () => {
  it.each(files)("%s imports server-only", (file) => {
    const text = readFileSync(join(AI_DIR, file), "utf8");
    expect(text).toMatch(/^import "server-only";/m);
  });
});
