import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FUNNEL_NAME,
  FUNNEL_STEPS,
  funnelQuery,
  upsertFunnel,
} from "../../../../scripts/posthog/funnel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scripts/posthog/funnel.ts", () => {
  it("has the 7 steps of project.md §6.11, in order", () => {
    expect(FUNNEL_STEPS.map(([event]) => event)).toEqual([
      "$pageview",
      "signed_up",
      "project_created",
      "knowledge_added",
      "snippet_copied",
      "first_chat",
      "upgraded",
    ]);
    const { source } = funnelQuery();
    expect(source.kind).toBe("FunnelsQuery");
    expect(source.series).toHaveLength(7);
  });

  it("step 1 is the landing page only, not any pageview", () => {
    const [landing, ...rest] = funnelQuery().source.series;
    expect(landing).toMatchObject({
      event: "$pageview",
      properties: [{ key: "$pathname", value: "/", operator: "exact" }],
    });
    expect(rest.every((s) => !("properties" in s))).toBe(true);
  });

  function fakeApi(existing: { id: number; short_id: string }[]) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? "GET";
        calls.push({
          method,
          url,
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (method === "GET") {
          return Response.json({
            results: existing.map((i) => ({ ...i, name: FUNNEL_NAME })),
          });
        }
        return Response.json({ id: 7, short_id: "abc", name: FUNNEL_NAME });
      }),
    );
    return calls;
  }

  const env = {
    POSTHOG_PERSONAL_API_KEY: "phx_test",
    POSTHOG_PROJECT_ID: "123",
  };

  it("creates the insight when none has its name", async () => {
    const calls = fakeApi([]);
    const result = await upsertFunnel(env);
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls[1]!.url).toBe(
      "https://us.posthog.com/api/projects/123/insights/",
    );
    expect(calls[1]!.body).toMatchObject({ name: FUNNEL_NAME });
    expect(result).toMatchObject({
      created: true,
      url: "https://us.posthog.com/project/123/insights/abc",
    });
  });

  it("updates the existing one on a re-run, never a duplicate", async () => {
    const calls = fakeApi([{ id: 7, short_id: "abc" }]);
    const result = await upsertFunnel(env);
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
    expect(calls[1]!.url).toBe(
      "https://us.posthog.com/api/projects/123/insights/7/",
    );
    expect(result.created).toBe(false);
  });

  it("refuses to run without a key", async () => {
    await expect(upsertFunnel({})).rejects.toThrow("POSTHOG_PERSONAL_API_KEY");
  });
});
