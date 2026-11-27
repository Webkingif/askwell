import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

const { GET } = await import("../../app/api/posthog-config/route");
const { routeAccess } = await import("../../lib/auth/routes");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/posthog-config", () => {
  it("returns the key and host, read when the request runs", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_first");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com/");
    const first = await GET();
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual({
      key: "phc_first",
      host: "https://eu.i.posthog.com",
    });

    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_second");
    expect(await (await GET()).json()).toMatchObject({ key: "phc_second" });
  });

  it("returns nulls without a key, so the browser skips PostHog", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: null, host: null });
  });

  it("never serves a personal API key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phx_personal");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    expect(await (await GET()).json()).toEqual({ key: null, host: null });
  });

  it("is public (no sign-in)", () => {
    expect(routeAccess("/api/posthog-config")).toBe("public");
  });
});
