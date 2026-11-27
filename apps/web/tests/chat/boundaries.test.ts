import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(import.meta.dirname, "../..");

describe("chat module", () => {
  it("is server only", () => {
    const text = readFileSync(join(WEB, "lib/chat/handle-chat.ts"), "utf8");
    expect(text).toMatch(/^import "server-only";/m);
  });

  it("never uses OpenAI", () => {
    for (const f of [
      "lib/chat/handle-chat.ts",
      "app/api/widget/chat/route.ts",
    ]) {
      expect(readFileSync(join(WEB, f), "utf8")).not.toMatch(/openai/i);
    }
  });
});
