import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ARCJET_KEY is server only (project.md §9).
const WEB = join(import.meta.dirname, "../..");
const ARCJET_DIR = join(WEB, "lib/arcjet");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("Arcjet is server only", () => {
  it.each(readdirSync(ARCJET_DIR))("lib/arcjet/%s imports server-only", (f) => {
    const text = readFileSync(join(ARCJET_DIR, f), "utf8");
    expect(text).toMatch(/^import "server-only";/m);
  });

  it("only lib/arcjet/env.ts reads ARCJET_KEY", () => {
    const readers = ["app", "components", "lib"]
      .flatMap((d) => walk(join(WEB, d)))
      .filter((p) => /process\.env\.ARCJET_KEY/.test(readFileSync(p, "utf8")))
      .map((p) => relative(WEB, p).replaceAll("\\", "/"));
    expect(readers).toEqual(["lib/arcjet/env.ts"]);
  });
});
