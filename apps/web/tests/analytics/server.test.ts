import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ph = vi.hoisted(() => ({
  instances: [] as { key: string; options: unknown }[],
  capture: vi.fn(),
  flush: vi.fn(async () => {}),
  captureExceptionImmediate: vi.fn(async () => {}),
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(key: string, options: unknown) {
      ph.instances.push({ key, options });
    }
    capture = ph.capture;
    flush = ph.flush;
    captureExceptionImmediate = ph.captureExceptionImmediate;
  },
}));

const {
  captureRequestError,
  captureServerEvent,
  getPostHogServer,
  readPostHogCookie,
  resetPostHogServerForTests,
} = await import("../../lib/analytics/server");

function withKey() {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  ph.instances.length = 0;
  resetPostHogServerForTests();
});

const request = { path: "/dashboard?x=1", method: "GET", headers: {} };
const context = {
  routerKind: "App Router",
  routePath: "/dashboard",
  routeType: "render",
};

describe("server analytics without a key", () => {
  it("makes no client and never throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(getPostHogServer()).toBeNull();
    expect(() =>
      captureServerEvent({ distinctId: "user_1", event: "project_created" }),
    ).not.toThrow();
    await expect(
      captureRequestError(new Error("boom"), request, context),
    ).resolves.toBeUndefined();
    expect(ph.instances).toHaveLength(0);
    expect(ph.capture).not.toHaveBeenCalled();
  });
});

describe("server analytics with a key", () => {
  it("reuses one client and flushes after capturing", () => {
    withKey();
    captureServerEvent({ distinctId: "user_1", event: "project_created" });
    captureServerEvent({ distinctId: "user_1", event: "knowledge_added" });
    expect(ph.instances).toEqual([
      { key: "phc_test", options: { host: "https://us.i.posthog.com" } },
    ]);
    expect(ph.capture).toHaveBeenCalledWith({
      distinctId: "user_1",
      event: "project_created",
      properties: undefined,
    });
    // Outside a request after() throws, so it flushes straight away.
    expect(ph.flush).toHaveBeenCalledTimes(2);
  });

  it("a failing PostHog never throws into the request", () => {
    withKey();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    ph.capture.mockImplementationOnce(() => {
      throw new Error("down");
    });
    expect(() =>
      captureServerEvent({ distinctId: "u", event: "e" }),
    ).not.toThrow();
    warn.mockRestore();
  });

  it("sends request errors with the browser's distinct and session IDs", async () => {
    withKey();
    const cookie = `other=1; ph_phc_test_posthog=${encodeURIComponent(
      JSON.stringify({ distinct_id: "user_1", $sesid: [1, "sess-1", 0] }),
    )}`;
    const error = new Error("boom");
    await captureRequestError(
      error,
      { ...request, headers: { cookie } },
      context,
    );
    expect(ph.captureExceptionImmediate).toHaveBeenCalledWith(error, {
      distinctId: "user_1",
      properties: expect.objectContaining({
        $session_id: "sess-1",
        path: "/dashboard",
        route_type: "render",
      }),
    });
  });
});

describe("readPostHogCookie", () => {
  it("ignores missing, foreign and malformed cookies", () => {
    expect(readPostHogCookie(undefined, "phc_a")).toEqual({});
    expect(readPostHogCookie("ph_phc_b_posthog=%7B%7D", "phc_a")).toEqual({});
    expect(readPostHogCookie("ph_phc_a_posthog=not-json", "phc_a")).toEqual({});
  });
});
