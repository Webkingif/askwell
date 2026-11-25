import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Static checks for project.md §9 "Secrets" and "Tenant leak".

const WEB_ROOT = join(import.meta.dirname, "../..");
const REPO_ROOT = join(WEB_ROOT, "../..");
const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_FILES = ["proxy.ts", "next.config.ts"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path] : [];
  });
}

const sources = [
  ...SOURCE_DIRS.flatMap((dir) => walk(join(WEB_ROOT, dir))),
  ...SOURCE_FILES.map((file) => join(WEB_ROOT, file)),
].map((path) => ({
  path: relative(WEB_ROOT, path).replaceAll("\\", "/"),
  text: readFileSync(path, "utf8"),
}));

const isClientComponent = (text: string) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);

const importsSupabaseClient = (text: string) =>
  /from\s+["'][^"']*lib\/supabase\/(service|owner)["']|import\(\s*["'][^"']*lib\/supabase\/(service|owner)["']/.test(
    text,
  );

describe("Supabase client boundaries", () => {
  it("finds the source files", () => {
    expect(sources.map((s) => s.path)).toContain("lib/supabase/service.ts");
  });

  it("no client component imports a Supabase server client", () => {
    const offenders = sources
      .filter((s) => isClientComponent(s.text) && importsSupabaseClient(s.text))
      .map((s) => s.path);
    expect(offenders).toEqual([]);
  });

  it("only service.ts reads SUPABASE_SECRET_KEY", () => {
    const readers = sources
      .filter((s) => s.text.includes("SUPABASE_SECRET_KEY"))
      .map((s) => s.path);
    expect(readers).toEqual(["lib/supabase/service.ts"]);
  });

  it('both clients start with import "server-only"', () => {
    for (const file of ["lib/supabase/service.ts", "lib/supabase/owner.ts"]) {
      const text = sources.find((s) => s.path === file)?.text ?? "";
      expect(text.trimStart().startsWith('import "server-only";')).toBe(true);
    }
  });

  it("detects a client component that imports the service client", () => {
    const bad =
      '"use client";\nimport { createServiceClient } from "@/lib/supabase/service";\n';
    expect(isClientComponent(bad) && importsSupabaseClient(bad)).toBe(true);
  });

  it("no NEXT_PUBLIC_* variable in .env.example names a secret", () => {
    const names = readFileSync(join(REPO_ROOT, ".env.example"), "utf8")
      .split("\n")
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter((name): name is string => name !== undefined);
    const publicSecrets = names.filter(
      (name) =>
        name.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE/.test(name),
    );
    expect(names).toContain("SUPABASE_SECRET_KEY");
    expect(publicSecrets).toEqual([]);
  });
});
