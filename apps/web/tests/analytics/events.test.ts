import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// after() needs a request scope; here it runs the flush at once.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const ph = vi.hoisted(() => ({
  instances: 0,
  capture: vi.fn(),
  flush: vi.fn(async () => {}),
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor() {
      ph.instances++;
    }
    capture = ph.capture;
    flush = ph.flush;
  },
}));

const { track } = await import("../../lib/analytics/events");
const { resetPostHogServerForTests } =
  await import("../../lib/analytics/server");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  ph.instances = 0;
  resetPostHogServerForTests();
});

describe("track", () => {
  it("sends the event once, under the given distinct ID, with its properties", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    track("project_created", "user_a", { projectId: "p1", plan: "free" });
    expect(ph.capture).toHaveBeenCalledExactlyOnceWith({
      event: "project_created",
      distinctId: "user_a",
      properties: { projectId: "p1", plan: "free" },
    });
    expect(ph.flush).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without a key: no client, nothing sent, no throw", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(() => track("signed_up", "user_a", {})).not.toThrow();
    expect(ph.instances).toBe(0);
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it("never throws when PostHog does", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ph.capture.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() =>
      track("knowledge_added", "user_a", { projectId: "p1", type: "text" }),
    ).not.toThrow();
  });
});
