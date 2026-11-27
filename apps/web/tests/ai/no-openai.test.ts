import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Askwell's AI is Google Gemini only (CLAUDE.md "AI", project.md §3). This
// guard reads every file an agent or the app reads and fails on any mention
// of OpenAI or its embedding model, except the known lines below.

const ROOT = join(import.meta.dirname, "../../../..");
const SCAN_PATHS = ["apps", "packages", "docs", "CLAUDE.md", ".env.example"];
const THIS_FILE = "apps/web/tests/ai/no-openai.test.ts";

const BANNED = /openai|text-embedding-3/i;

/** Lines allowed to match, by file: each says why it mentions OpenAI. */
const ALLOWED: Record<string, RegExp[]> = {
  // The rule itself.
  "CLAUDE.md": [/Never use OpenAI models, the `openai` package/],
  // Notes that the initial migration's comment is wrong.
  "docs/project.md": [
    /an old comment in the initial migration says text-embedding-3-small; it's wrong/,
  ],
  // The chat route's own guard, which this test extends.
  "apps/web/tests/chat/boundaries.test.ts": [
    /it\("never uses OpenAI"/,
    /not\.toMatch\(\/openai\/i\)/,
  ],
};

/**
 * Every file to check, as repo-relative paths: what git tracks, plus new
 * files it doesn't ignore. So dependencies and build output (node_modules,
 * .next, tsbuildinfo, the built widget.js) are never read.
 */
function filesToScan(): string[] {
  const out = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ...SCAN_PATHS,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  return [...new Set(out.split("\0").filter(Boolean))].filter(
    (f) => f !== THIS_FILE && existsSync(join(ROOT, f)),
  );
}

/** The lines of `text` that mention OpenAI and aren't allowed for `file`. */
function bannedLines(file: string, text: string): string[] {
  const allowed = ALLOWED[file] ?? [];
  return text
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => BANNED.test(line))
    .filter(({ line }) => !allowed.some((a) => a.test(line)))
    .map(({ line, n }) => `${file}:${n}: ${line.trim()}`);
}

describe("Gemini only, never OpenAI", () => {
  const files = filesToScan();

  it("scans the whole app, the packages, the docs and CLAUDE.md", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "CLAUDE.md",
        ".env.example",
        "docs/project.md",
        "apps/web/lib/ai/models.ts",
        "apps/widget/src/index.ts",
        "packages/shared/src/index.ts",
      ]),
    );
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });

  it("no file mentions OpenAI or text-embedding-3", () => {
    const hits: string[] = [];
    for (const file of files) {
      const buf = readFileSync(join(ROOT, file));
      if (buf.includes(0)) continue; // binary (PDF fixtures, images)
      if (statSync(join(ROOT, file)).size > 2_000_000) continue;
      hits.push(...bannedLines(file, buf.toString("utf8")));
    }
    expect(hits).toEqual([]);
  });

  it("flags a new mention anywhere, including in an allowed file", () => {
    expect(
      bannedLines("apps/web/lib/ai/x.ts", 'import OpenAI from "openai";'),
    ).toHaveLength(1);
    expect(
      bannedLines("CLAUDE.md", "Use OPENAI_API_KEY for chat."),
    ).toHaveLength(1);
    expect(
      bannedLines("docs/plan.md", "Embed with text-embedding-3-small."),
    ).toHaveLength(1);
    expect(bannedLines("apps/web/lib/ai/x.ts", "gemini-embedding-001")).toEqual(
      [],
    );
  });
});
