// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({ posthog: false, initAt: [] as string[] }));
vi.mock("posthog-js", () => {
  loaded.posthog = true;
  return {
    default: {
      // Where the URL was when PostHog started: its first $pageview reads it.
      init: vi.fn(() => loaded.initAt.push(window.location.pathname)),
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  loaded.posthog = false;
  loaded.initAt = [];
  window.history.replaceState(null, "", "/");
});

async function boot(path: string) {
  window.history.replaceState(null, "", path);
  const fetchMock = vi.fn(async () =>
    Response.json({ key: "phc_test", host: "https://us.i.posthog.com" }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("../../instrumentation-client");
  // Let the async start settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { mod, fetchMock };
}

describe("instrumentation-client", () => {
  it("on /embed it never fetches the config or loads posthog-js", async () => {
    const { fetchMock } = await boot("/embed?key=pk_x");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loaded.posthog).toBe(false);
  });

  it("on the landing page it fetches the config and loads posthog-js", async () => {
    const { fetchMock } = await boot("/");
    expect(fetchMock).toHaveBeenCalledWith("/api/posthog-config", {
      cache: "no-store",
    });
    expect(loaded.posthog).toBe(true);
  });

  it("starts on a client-side move into the dashboard", async () => {
    const { mod, fetchMock } = await boot("/sign-in");
    expect(fetchMock).not.toHaveBeenCalled();
    mod.onRouterTransitionStart("/dashboard");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after sign-in, starts only once the URL says /dashboard (no /sign-in pageview)", async () => {
    const { mod } = await boot("/sign-in");
    // (A path of its own: the test above left a start waiting for /dashboard.)
    mod.onRouterTransitionStart("/dashboard/projects/p1");
    await new Promise((r) => setTimeout(r, 120));
    // The router hasn't changed the URL yet: PostHog waits.
    expect(loaded.initAt).toEqual([]);
    window.history.pushState(null, "", "/dashboard/projects/p1");
    await new Promise((r) => setTimeout(r, 120));
    expect(loaded.initAt).toEqual(["/dashboard/projects/p1"]);
  });
});
