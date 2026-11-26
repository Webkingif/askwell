import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import { routeAccess } from "../../lib/auth/routes";

// proxy.ts wraps its handler in clerkMiddleware; only `config` is under test.
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => {} }));
const { config } = await import("../../proxy");

const matches = (url: string) =>
  unstable_doesMiddlewareMatch({ config, url: `https://app.example${url}` });

describe("proxy matcher (PPW-T11)", () => {
  // Visitor-facing paths must never reach Clerk: in a cross-origin iframe its
  // handshake redirect loops forever.
  it.each([
    "/embed",
    "/embed?key=x",
    "/embed?key=pk_test_0123456789abcdef",
    "/embed/anything",
    "/api/widget/config",
    "/api/widget/config?key=x",
    "/api/widget/chat",
    "/widget.js",
    "/widget.js?v=1",
  ])("skips %s", (url) => {
    expect(matches(url)).toBe(false);
  });

  it.each([
    "/",
    "/dashboard",
    "/dashboard/projects/x",
    "/dashboard/billing",
    "/api/projects",
    "/api/projects/x",
    "/api/projects/x/knowledge",
    "/api/conversations/x",
    "/api/widget", // not below /api/widget/: owner API, stays protected
    "/api/widgets/x",
    "/api/clerk/webhook",
    "/sign-in",
    "/sign-up/verify",
    "/__clerk/x",
    "/embedded", // only /embed and below are skipped
    "/x/embed",
  ])("still runs for %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it("every skipped path is public in routeAccess", () => {
    for (const path of [
      "/embed",
      "/embed/x",
      "/api/widget/config",
      "/widget.js",
    ]) {
      expect(routeAccess(path)).toBe("public");
    }
  });
});
