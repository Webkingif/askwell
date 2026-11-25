import { apiErrorSchema } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import {
  authDecision,
  routeAccess,
  UNAUTHORIZED_STATUS,
  unauthorizedBody,
} from "../../lib/auth/routes";

describe("routeAccess", () => {
  it.each(["/dashboard", "/dashboard/", "/dashboard/projects/123"])(
    "protects the page %s",
    (path) => expect(routeAccess(path)).toBe("owner-page"),
  );

  it.each([
    "/api/projects",
    "/api/projects/abc/knowledge",
    "/api/knowledge/abc",
    "/api/conversations/abc",
    "/api",
    "/api/widget", // only paths below /api/widget/ are public
    "/api/clerk", // only the webhook itself is public
    "/api/clerk/webhook/extra",
  ])("protects the owner API %s", (path) =>
    expect(routeAccess(path)).toBe("owner-api"),
  );

  it.each([
    "/api/widget/config",
    "/api/widget/chat",
    "/api/clerk/webhook",
    "/api/posthog-config",
  ])("leaves the public API %s open", (path) =>
    expect(routeAccess(path)).toBe("public"),
  );

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/embed",
    "/ui",
    "/dashboardx",
    "/apis",
  ])("leaves the page %s open", (path) =>
    expect(routeAccess(path)).toBe("public"),
  );
});

describe("authDecision", () => {
  it("redirects a signed-out visitor away from /dashboard", () => {
    expect(authDecision("/dashboard", false)).toBe("redirect-to-sign-in");
  });

  it("answers a signed-out owner API call with 401, not a redirect", () => {
    expect(authDecision("/api/projects", false)).toBe("unauthorized");
  });

  it("lets signed-in owners through", () => {
    expect(authDecision("/dashboard", true)).toBe("allow");
    expect(authDecision("/api/projects", true)).toBe("allow");
  });

  it("never blocks public routes", () => {
    expect(authDecision("/api/widget/config", false)).toBe("allow");
    expect(authDecision("/", false)).toBe("allow");
    expect(authDecision("/sign-in", false)).toBe("allow");
  });
});

describe("unauthorizedBody", () => {
  it("is an ApiError with code unauthorized and status 401", () => {
    const body = unauthorizedBody();
    expect(apiErrorSchema.parse(body)).toEqual(body);
    expect(body.error.code).toBe("unauthorized");
    expect(UNAUTHORIZED_STATUS).toBe(401);
  });
});
