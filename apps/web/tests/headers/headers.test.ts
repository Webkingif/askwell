import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import { routeAccess } from "../../lib/auth/routes";
import nextConfig from "../../next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<Rule[]> {
  if (!nextConfig.headers) throw new Error("next.config has no headers()");
  return (await nextConfig.headers()) as Rule[];
}

/**
 * The headers Next sends for `pathname`: every matching rule applies, in
 * order, and a later value for the same key wins. Matching uses Next's own
 * path matcher with the options Next uses for custom headers.
 */
async function headersFor(pathname: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rule of await rules()) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
    });
    if (match(pathname) === false) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

describe("next.config headers()", () => {
  it("serves /widget.js as cross-origin JavaScript with a short cache", async () => {
    const h = await headersFor("/widget.js");
    expect(h["access-control-allow-origin"]).toBe("*");
    expect(h["content-type"]).toMatch(/^application\/javascript\b/);
    expect(h["cache-control"]).toBe("public, max-age=300");
  });

  // "/embed/" never renders: Next 308-redirects it to "/embed" first.
  it.each(["/embed", "/embed/anything", "/embed/a/b"])(
    "lets any site frame %s, with no X-Frame-Options",
    async (path) => {
      const h = await headersFor(path);
      expect(h["content-security-policy"]).toBe("frame-ancestors *");
      expect(h["x-frame-options"]).toBeUndefined();
    },
  );

  it.each([
    "/",
    "/dashboard",
    "/dashboard/projects/abc",
    "/sign-in",
    "/sign-up/verify",
    "/api/widget/config",
    "/api/projects",
    "/widget.js",
    "/embedded",
    "/embeds/x",
    "/x/embed",
    "/favicon.ico",
  ])("allows only same-origin framing of %s", async (path) => {
    const h = await headersFor(path);
    expect(h["content-security-policy"]).toBe("frame-ancestors 'self'");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("only /widget.js gets the CORS header", async () => {
    for (const path of ["/", "/embed", "/dashboard", "/api/widget/config"]) {
      expect((await headersFor(path))["access-control-allow-origin"]).toBe(
        undefined,
      );
    }
  });
});

describe("routeAccess for the widget paths", () => {
  it.each(["/widget.js", "/embed", "/embed/x"])(
    "%s is public (no sign-in)",
    (path) => expect(routeAccess(path)).toBe("public"),
  );
});
