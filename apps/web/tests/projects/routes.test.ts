import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_LIMITS, PUBLIC_KEY_PATTERN } from "@askwell/shared";
import { addRow, resetStore, store } from "./fake-db";

vi.mock("server-only", () => ({}));

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
}));

vi.mock("../../lib/supabase/owner", () => import("./fake-db"));
vi.mock("../../lib/supabase/service", () => import("./fake-db"));

// ensureAccount has its own tests; here it returns the stored plan.
vi.mock("../../lib/accounts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/accounts")>();
  return {
    ...real,
    ensureAccount: async () => {
      if (!clerk.userId) throw new real.NotSignedInError();
      return {
        clerk_user_id: clerk.userId,
        plan: store.plans.get(clerk.userId) ?? "free",
      };
    },
  };
});

const collection = await import("../../app/api/projects/route");
const item = await import("../../app/api/projects/[id]/route");

const A = "user_a";
const B = "user_b";
const MISSING_ID = "99999999-0000-4000-8000-000000000000";

function signIn(id: string | null) {
  clerk.userId = id;
  store.sub = id;
}

const json = (body: unknown) =>
  new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as unknown };
}

const errorBody = (code: string) => ({
  error: { code, message: expect.any(String) },
});

beforeEach(() => {
  resetStore();
  signIn(null);
});

describe("GET /api/projects", () => {
  it("lists only the owner's projects, newest first, as Project", async () => {
    const older = addRow(A, "Older");
    addRow(B, "Not mine");
    const newer = addRow(A, "Newer");
    signIn(A);

    const { status, body } = await read(await collection.GET());
    expect(status).toBe(200);
    expect(body).toEqual({
      projects: [newer, older].map((r) => ({
        id: r.id,
        name: r.name,
        publicKey: r.public_key,
        messagesUsed: r.messages_used,
        periodStart: r.period_start,
        createdAt: r.created_at,
      })),
    });
    expect(store.calls).toEqual(["owner:select"]);
  });

  it("401 when signed out", async () => {
    const { status, body } = await read(await collection.GET());
    expect(status).toBe(401);
    expect(body).toEqual(errorBody("unauthorized"));
    expect(store.calls).toEqual([]);
  });

  it("500 with a generic message when the database fails", async () => {
    signIn(A);
    store.ownerError = { code: "PGRST301", message: "JWT invalid" };
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { status, body } = await read(await collection.GET());
    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
  });
});

describe("POST /api/projects", () => {
  it("creates a project via create_project with the plan's limit", async () => {
    signIn(A);
    const { status, body } = await read(
      await collection.POST(json({ name: "  My site  " })),
    );
    expect(status).toBe(201);
    expect(body).toMatchObject({ project: { name: "My site" } });
    expect(
      (body as { project: { publicKey: string } }).project.publicKey,
    ).toMatch(PUBLIC_KEY_PATTERN);
    expect(store.rpcArgs).toEqual([
      {
        p_owner_id: A,
        p_name: "My site",
        p_max_projects: PLAN_LIMITS.free.projects,
      },
    ]);
    // The service client is used for create_project only.
    expect(store.calls).toEqual(["service:rpc:create_project"]);
  });

  it("402 plan_limit_reached on the second Free project", async () => {
    signIn(A);
    expect((await collection.POST(json({ name: "First" }))).status).toBe(201);
    const { status, body } = await read(
      await collection.POST(json({ name: "Second" })),
    );
    expect(status).toBe(402);
    expect(body).toEqual(errorBody("plan_limit_reached"));
    expect(store.rows).toHaveLength(1);
  });

  it("passes the Pro limit for a Pro owner", async () => {
    store.plans.set(A, "pro");
    signIn(A);
    for (let i = 0; i < PLAN_LIMITS.pro.projects; i++) {
      expect((await collection.POST(json({ name: `P${i}` }))).status).toBe(201);
    }
    expect((await collection.POST(json({ name: "One more" }))).status).toBe(
      402,
    );
    expect(store.rpcArgs.at(-1)).toMatchObject({
      p_max_projects: PLAN_LIMITS.pro.projects,
    });
  });

  it("ignores an owner_id in the body", async () => {
    signIn(A);
    await collection.POST(json({ name: "Mine", owner_id: B }));
    expect(store.rpcArgs).toEqual([expect.objectContaining({ p_owner_id: A })]);
  });

  it.each([
    ["no body", ""],
    ["bad JSON", "{"],
    ["missing name", {}],
    ["blank name", { name: "   " }],
    ["name too long", { name: "x".repeat(81) }],
    ["name not a string", { name: 42 }],
  ])("400 for %s", async (_label, body) => {
    signIn(A);
    const res = await read(await collection.POST(json(body)));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody("invalid_request"));
    expect(store.calls).toEqual([]);
  });

  it("401 when signed out", async () => {
    const { status, body } = await read(
      await collection.POST(json({ name: "X" })),
    );
    expect(status).toBe(401);
    expect(body).toEqual(errorBody("unauthorized"));
    expect(store.calls).toEqual([]);
  });
});

describe("PATCH /api/projects/:id", () => {
  const patch = (body: unknown) =>
    new Request("http://localhost/api/projects/x", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  it("renames the owner's project through the owner client", async () => {
    const row = addRow(A, "Old");
    signIn(A);
    const { status, body } = await read(
      await item.PATCH(patch({ name: "New" }), ctx(row.id)),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ project: { id: row.id, name: "New" } });
    expect(store.calls).toEqual(["owner:update"]);
  });

  it("404 for another owner's project, and leaves it alone", async () => {
    const theirs = addRow(B, "Theirs");
    signIn(A);
    const { status, body } = await read(
      await item.PATCH(patch({ name: "Hijacked" }), ctx(theirs.id)),
    );
    expect(status).toBe(404);
    expect(body).toEqual(errorBody("not_found"));
    expect(theirs.name).toBe("Theirs");
  });

  it("404 for an unknown id", async () => {
    signIn(A);
    const res = await item.PATCH(patch({ name: "X" }), ctx(MISSING_ID));
    expect(res.status).toBe(404);
  });

  it("400 for a bad id or name", async () => {
    const row = addRow(A, "Old");
    signIn(A);
    const badId = await read(
      await item.PATCH(patch({ name: "X" }), ctx("nope")),
    );
    expect(badId.status).toBe(400);
    expect(badId.body).toEqual(errorBody("invalid_request"));
    const badName = await item.PATCH(patch({ name: "" }), ctx(row.id));
    expect(badName.status).toBe(400);
    expect(store.calls).toEqual([]);
  });

  it("401 when signed out", async () => {
    const row = addRow(A, "Old");
    const res = await item.PATCH(patch({ name: "X" }), ctx(row.id));
    expect(res.status).toBe(401);
    expect(row.name).toBe("Old");
  });
});

describe("DELETE /api/projects/:id", () => {
  const del = () =>
    new Request("http://localhost/api/projects/x", { method: "DELETE" });

  it("deletes the owner's project through the owner client", async () => {
    const row = addRow(A, "Doomed");
    signIn(A);
    const { status, body } = await read(await item.DELETE(del(), ctx(row.id)));
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(store.rows).toEqual([]);
    expect(store.calls).toEqual(["owner:delete"]);
  });

  it("404 for another owner's project, and keeps it", async () => {
    const theirs = addRow(B, "Theirs");
    signIn(A);
    const { status, body } = await read(
      await item.DELETE(del(), ctx(theirs.id)),
    );
    expect(status).toBe(404);
    expect(body).toEqual(errorBody("not_found"));
    expect(store.rows).toEqual([theirs]);
  });

  it("400 for a bad id", async () => {
    signIn(A);
    const res = await item.DELETE(del(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("401 when signed out", async () => {
    const row = addRow(A, "Kept");
    const res = await item.DELETE(del(), ctx(row.id));
    expect(res.status).toBe(401);
    expect(store.rows).toEqual([row]);
  });
});

describe("getOwnedProject", () => {
  it("returns the owner's project and null for anyone else's", async () => {
    const { getOwnedProject } = await import("../../lib/projects");
    const mine = addRow(A, "Mine");
    const theirs = addRow(B, "Theirs");
    signIn(A);
    await expect(getOwnedProject(mine.id)).resolves.toMatchObject({
      id: mine.id,
      publicKey: mine.public_key,
    });
    await expect(getOwnedProject(theirs.id)).resolves.toBeNull();
    expect(store.calls.every((c) => c.startsWith("owner:"))).toBe(true);
  });
});
