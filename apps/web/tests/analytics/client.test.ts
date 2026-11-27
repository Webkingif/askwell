import type { PostHog } from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  posthogOptions,
  resetAnalyticsForTests,
  setAnalyticsUser,
  startAnalytics,
  trackClient,
  type AnalyticsDeps,
} from "../../lib/analytics/client";
import { isEmbedPath, isTrackedPath } from "../../lib/analytics/paths";

/** A stand-in posthog-js with the calls we use. */
function fakePostHog() {
  const state = { distinctId: "anon-1", identified: false };
  const ph = {
    init: vi.fn(),
    identify: vi.fn((id: string) => {
      state.distinctId = id;
      state.identified = true;
    }),
    reset: vi.fn(() => {
      state.distinctId = "anon-2";
      state.identified = false;
    }),
    capture: vi.fn(),
    get_distinct_id: () => state.distinctId,
    _isIdentified: () => state.identified,
  };
  return ph;
}

function deps(
  config: Awaited<ReturnType<AnalyticsDeps["fetchConfig"]>> = {
    key: "phc_test",
    host: "https://us.i.posthog.com",
  },
) {
  const ph = fakePostHog();
  const d = {
    fetchConfig: vi.fn(async () => config),
    loadPostHog: vi.fn(async () => ph as unknown as PostHog),
  };
  return { ph, d };
}

afterEach(() => {
  resetAnalyticsForTests();
});

describe("tracked paths", () => {
  it.each(["/", "/dashboard", "/dashboard/projects/abc/install"])(
    "%s is tracked",
    (path) => expect(isTrackedPath(path)).toBe(true),
  );

  it.each(["/embed", "/embed/", "/embed/x", "/sign-in", "/ui", "/dashboardx"])(
    "%s is not tracked",
    (path) => expect(isTrackedPath(path)).toBe(false),
  );

  it("knows /embed and below it, not look-alikes", () => {
    expect(isEmbedPath("/embed")).toBe(true);
    expect(isEmbedPath("/embed/a")).toBe(true);
    expect(isEmbedPath("/embedded")).toBe(false);
  });
});

describe("startAnalytics", () => {
  it.each(["/embed", "/embed/panel"])(
    "on %s it fetches nothing and loads no posthog-js",
    async (path) => {
      const { d } = deps();
      expect(await startAnalytics(path, d)).toBeNull();
      expect(d.fetchConfig).not.toHaveBeenCalled();
      expect(d.loadPostHog).not.toHaveBeenCalled();
    },
  );

  it("is a no-op without a key: posthog-js is never loaded", async () => {
    const { d } = deps({ key: null, host: null });
    expect(await startAnalytics("/", d)).toBeNull();
    expect(d.loadPostHog).not.toHaveBeenCalled();
  });

  it("never throws when the config can't be fetched", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d: AnalyticsDeps = {
      fetchConfig: async () => {
        throw new Error("offline");
      },
      loadPostHog: vi.fn(),
    };
    await expect(startAnalytics("/dashboard", d)).resolves.toBeNull();
    warn.mockRestore();
  });

  it("inits once on the landing page with masked replays and exception capture", async () => {
    const { ph, d } = deps();
    await startAnalytics("/", d);
    await startAnalytics("/dashboard", d);
    expect(ph.init).toHaveBeenCalledTimes(1);
    expect(ph.init).toHaveBeenCalledWith(
      "phc_test",
      posthogOptions("https://us.i.posthog.com"),
    );
    const options = posthogOptions("https://h");
    expect(options.capture_exceptions).toBe(true);
    expect(options.session_recording.maskAllInputs).toBe(true);
    expect(options.api_host).toBe("https://h");
  });
});

describe("setAnalyticsUser", () => {
  it("identifies a user who signed in before PostHog started", async () => {
    const { ph, d } = deps();
    setAnalyticsUser("user_1");
    await startAnalytics("/dashboard", d);
    expect(ph.identify).toHaveBeenCalledWith("user_1");
  });

  it("identifies on sign-in and resets on sign-out", async () => {
    const { ph, d } = deps();
    await startAnalytics("/dashboard", d);
    setAnalyticsUser(null);
    expect(ph.reset).not.toHaveBeenCalled();
    setAnalyticsUser("user_1");
    setAnalyticsUser("user_1");
    expect(ph.identify).toHaveBeenCalledTimes(1);
    setAnalyticsUser(null);
    expect(ph.reset).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh identity when a different user signs in", async () => {
    const { ph, d } = deps();
    await startAnalytics("/dashboard", d);
    setAnalyticsUser("user_1");
    resetAnalyticsForTests();
    // A full reload: our module state is gone, posthog-js still remembers user_1.
    const d2 = { ...d, fetchConfig: d.fetchConfig };
    setAnalyticsUser("user_2");
    await startAnalytics("/dashboard", d2);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    expect(ph.identify).toHaveBeenLastCalledWith("user_2");
  });

  it("does nothing where PostHog never started", () => {
    expect(() => setAnalyticsUser("user_1")).not.toThrow();
  });
});

describe("trackClient", () => {
  it("sends the event once PostHog has started", async () => {
    const { ph, d } = deps();
    await startAnalytics("/dashboard/projects/p1/install", d);
    trackClient("snippet_copied", { projectId: "p1" });
    expect(ph.capture).toHaveBeenCalledExactlyOnceWith("snippet_copied", {
      projectId: "p1",
    });
  });

  it("is a no-op without a key or on /embed, and never throws", async () => {
    const noKey = deps({ key: null, host: null });
    await startAnalytics("/dashboard", noKey.d);
    expect(() =>
      trackClient("snippet_copied", { projectId: "p1" }),
    ).not.toThrow();
    expect(noKey.ph.capture).not.toHaveBeenCalled();

    resetAnalyticsForTests();
    const embed = deps();
    await startAnalytics("/embed", embed.d);
    trackClient("snippet_copied", { projectId: "p1" });
    expect(embed.ph.capture).not.toHaveBeenCalled();
  });
});
