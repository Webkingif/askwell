import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";

vi.mock("server-only", () => ({}));

type ConfigRow = {
  button_color: string;
  position: string;
  label: string;
  animation: string;
  header_text: string;
  show_badge: boolean;
};

/** Projects by public key, as the service client's embedded select returns them. */
const db = vi.hoisted(() => ({
  projects: new Map<
    string,
    {
      id: string;
      owner_id: string;
      messages_used: number;
      widget_configs: ConfigRow | null;
      accounts: { plan: string } | null;
    }
  >(),
  error: null as { code: string; message: string } | null,
  queries: [] as { table: string; select: string; eq: [string, string] }[],
}));

vi.mock("../../lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: (select: string) => ({
        eq: (col: string, value: string) => ({
          maybeSingle: async () => {
            db.queries.push({ table, select, eq: [col, value] });
            if (db.error) return { data: null, error: db.error };
            const p = col === "public_key" ? db.projects.get(value) : undefined;
            if (!p) return { data: null, error: null };
            // Return only what the select names, like PostgREST.
            const data: Record<string, unknown> = {};
            if (select.includes("widget_configs")) {
              data.widget_configs = p.widget_configs;
            }
            if (select.includes("accounts")) data.accounts = p.accounts;
            for (const extra of ["id", "owner_id", "messages_used"] as const) {
              if (new RegExp(`(^|[ ,])${extra}([ ,]|$)`).test(select)) {
                data[extra] = p[extra];
              }
            }
            return { data, error: null };
          },
        }),
      }),
    }),
  }),
}));

const protect = vi.hoisted(() => ({
  result: { allowed: true } as
    { allowed: true } | { allowed: false; reason: "rate_limit" | "injection" },
  calls: [] as { request: Request; options: Record<string, unknown> }[],
}));

vi.mock("../../lib/arcjet/protect", () => ({
  protectWidgetRequest: async (
    request: Request,
    options: Record<string, unknown>,
  ) => {
    protect.calls.push({ request, options });
    return protect.result;
  },
}));

const route = await import("../../app/api/widget/config/route");
const { getWidgetConfigByKey } = await import("../../lib/widget-config");

const FREE_KEY = "pk_free000000000000000000";
const PRO_KEY = "pk_pro0000000000000000000";
const UNKNOWN_KEY = "pk_unknown00000000000000";

const CUSTOM: ConfigRow = {
  button_color: "#ff5500",
  position: "top-left",
  label: "Need help?",
  animation: "slide",
  header_text: "Hi there",
  show_badge: false,
};

const CUSTOM_CONFIG = {
  buttonColor: "#ff5500",
  position: "top-left",
  label: "Need help?",
  animation: "slide",
  headerText: "Hi there",
  showBadge: false,
};

function addProject(key: string, plan: string, config: ConfigRow | null) {
  db.projects.set(key, {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    owner_id: "user_secret",
    messages_used: 7,
    widget_configs: config,
    accounts: { plan },
  });
}

const get = (query: string) =>
  route.GET(new NextRequest(`http://localhost/api/widget/config${query}`));

beforeEach(() => {
  protect.result = { allowed: true };
  protect.calls = [];
  db.projects.clear();
  db.error = null;
  db.queries = [];
  addProject(FREE_KEY, "free", CUSTOM);
  addProject(PRO_KEY, "pro", CUSTOM);
});

describe("GET /api/widget/config", () => {
  it("rate limits with Arcjet on the config route and the public key", async () => {
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.status).toBe(200);
    expect(protect.calls).toHaveLength(1);
    expect(protect.calls[0].options).toEqual({
      route: "config",
      publicKey: PRO_KEY,
    });
    expect(protect.calls[0].request.url).toContain(`key=${PRO_KEY}`);
  });

  it("returns 429 rate_limited with the CORS headers when blocked", async () => {
    protect.result = { allowed: false, reason: "rate_limit" };
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "rate_limited", message: expect.any(String) },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Blocked before the database.
    expect(db.queries).toHaveLength(0);
  });

  it("does not call Arcjet for a malformed key", async () => {
    const res = await get("?key=nope");
    expect(res.status).toBe(404);
    expect(protect.calls).toHaveLength(0);
  });

  it("Free gets the defaults and the badge, whatever is saved", async () => {
    const res = await get(`?key=${FREE_KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
  });

  it("Pro gets the saved config", async () => {
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: CUSTOM_CONFIG });
  });

  it("returns only WidgetConfig fields (no ids, owner or usage)", async () => {
    const body = (await (await get(`?key=${PRO_KEY}`)).json()) as {
      config: Record<string, unknown>;
    };
    expect(Object.keys(body)).toEqual(["config"]);
    expect(Object.keys(body.config).sort()).toEqual(
      Object.keys(DEFAULT_WIDGET_CONFIG).sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/user_secret|aaaaaaaa/);
  });

  it("looks the project up by public_key only, selecting config and plan", async () => {
    await get(`?key=${PRO_KEY}`);
    expect(db.queries).toEqual([
      {
        table: "projects",
        select:
          "widget_configs (button_color, position, label, animation, header_text, show_badge), accounts (plan)",
        eq: ["public_key", PRO_KEY],
      },
    ]);
  });

  it("sends CORS for any origin, no credentials, and a short public cache", async () => {
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("answers the CORS preflight", async () => {
    const res = route.OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it.each([
    ["an unknown key", `?key=${UNKNOWN_KEY}`],
    ["a malformed key", "?key=not-a-key"],
    ["a too-short key", "?key=pk_short"],
    ["no key", ""],
  ])("404 not_found for %s, with CORS and the same body", async (_l, q) => {
    const res = await get(q);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "Unknown widget key." },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("doesn't query the database for a malformed key", async () => {
    await get("?key=nope");
    expect(db.queries).toEqual([]);
  });

  it("500 with a generic message when the database fails", async () => {
    db.error = { code: "XX000", message: "boom" };
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("getWidgetConfigByKey", () => {
  it("returns null for an unknown key", async () => {
    await expect(getWidgetConfigByKey(UNKNOWN_KEY)).resolves.toBeNull();
  });

  it("treats an unknown plan as Free", async () => {
    addProject(PRO_KEY, "enterprise", CUSTOM);
    await expect(getWidgetConfigByKey(PRO_KEY)).resolves.toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
  });

  it("falls back to the defaults when the config row is missing", async () => {
    addProject(PRO_KEY, "pro", null);
    await expect(getWidgetConfigByKey(PRO_KEY)).resolves.toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
  });

  it("Free still gets the fade animation and the badge for a Pro-only saved config", async () => {
    addProject(FREE_KEY, "free", { ...CUSTOM, animation: "scale" });
    const config = await getWidgetConfigByKey(FREE_KEY);
    expect(config?.animation).toBe("fade");
    expect(config?.showBadge).toBe(true);
  });

  it("throws when the saved config is invalid", async () => {
    addProject(PRO_KEY, "pro", { ...CUSTOM, position: "middle" });
    await expect(getWidgetConfigByKey(PRO_KEY)).rejects.toThrow(
      "widget-config: saved config is invalid",
    );
  });
});
