import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws outside a React Server environment; the clients are
// server code, so stub it here.
vi.mock("server-only", () => ({}));

const getToken = vi.fn<() => Promise<string | null>>();
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ getToken }),
}));

const { createOwnerClient } = await import("../../lib/supabase/owner");
const { createServiceClient } = await import("../../lib/supabase/service");

const URL = "https://abcdefghijklmnop.supabase.co";

/** Captures the headers of each Data API request. */
function stubFetch() {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  getToken.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createOwnerClient", () => {
  it("sends the owner's Clerk session token with the publishable key", async () => {
    getToken.mockResolvedValue("clerk-session-token");
    const calls = stubFetch();

    const { error } = await createOwnerClient().from("accounts").select("plan");

    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`${URL}/rest/v1/accounts`);
    expect(calls[0].headers.get("authorization")).toBe(
      "Bearer clerk-session-token",
    );
    expect(calls[0].headers.get("apikey")).toBe("sb_publishable_test");
  });

  it("asks Clerk for a fresh token on every request", async () => {
    // supabase-js may also ask once at construction (Realtime), so count
    // rather than assume an order.
    let issued = 0;
    getToken.mockImplementation(async () => `token-${++issued}`);
    const calls = stubFetch();
    const client = createOwnerClient();

    await client.from("accounts").select();
    await client.from("accounts").select();

    const [first, second] = calls.map((c) => c.headers.get("authorization"));
    expect(first).toMatch(/^Bearer token-\d+$/);
    expect(second).toMatch(/^Bearer token-\d+$/);
    expect(second).not.toBe(first);
  });

  it("never uses the secret key", async () => {
    getToken.mockResolvedValue("t");
    const calls = stubFetch();

    await createOwnerClient().from("accounts").select();

    for (const value of calls[0].headers.values()) {
      expect(value).not.toContain("sb_secret_");
    }
  });

  it("falls back to the publishable key (the anon role) with no session", async () => {
    getToken.mockResolvedValue(null);
    const calls = stubFetch();

    await createOwnerClient().from("accounts").select();

    expect(calls[0].headers.get("authorization")).toBe(
      "Bearer sb_publishable_test",
    );
  });

  it("throws a clear error when the env is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createOwnerClient()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL is not set",
    );
  });
});

describe("createServiceClient", () => {
  it("authenticates with the secret key and no Clerk session", async () => {
    const calls = stubFetch();

    await createServiceClient().from("accounts").select();

    expect(calls[0].headers.get("apikey")).toBe("sb_secret_test");
    expect(getToken).not.toHaveBeenCalled();
  });

  it("throws a clear error when the secret key is missing", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => createServiceClient()).toThrow(
      "Supabase env: SUPABASE_SECRET_KEY is not set",
    );
  });
});
