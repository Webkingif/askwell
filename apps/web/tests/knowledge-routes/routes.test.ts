import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS } from "@askwell/shared";
import { STALE_MS, addProject, addSource, resetStore, store } from "./fake";

vi.mock("server-only", () => ({}));

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
}));

vi.mock("../../lib/supabase/owner", () => import("./fake"));
vi.mock("../../lib/supabase/service", () => import("./fake"));

// after() needs a request scope; here it queues the callback for the test to run.
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    afterQueue.push(fn);
  },
}));

const processSource = vi.hoisted(() => vi.fn(async () => ({ status: "ready", chunks: 1 })));
vi.mock("../../lib/knowledge/process", () => ({
  KNOWLEDGE_BUCKET: "knowledge",
  processSource,
}));

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

// Product events: recorded here, sent by lib/analytics/events in the app.
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("../../lib/analytics/events", () => analytics);

const paste = await import("../../app/api/projects/[id]/knowledge/route");
const uploadUrl = await import("../../app/api/projects/[id]/knowledge/upload-url/route");
const finalize = await import("../../app/api/projects/[id]/knowledge/finalize/route");
const remove = await import("../../app/api/knowledge/[id]/route");
const { safeFileName } = await import("../../lib/knowledge-routes");

const A = "user_a";
const B = "user_b";
const MISSING_ID = "99999999-0000-4000-8000-000000000000";
const FREE_LIMIT = PLAN_LIMITS.free.knowledgeSources;

function signIn(id: string | null) {
  clerk.userId = id;
  store.sub = id;
}

const post = (body: unknown) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

const errorBody = (code: string) => ({
  error: { code, message: expect.any(String) },
});

const bytes = (s: string) => new TextEncoder().encode(s);
const old = () => new Date(Date.now() - STALE_MS - 60_000).toISOString();

const textBody = { title: "FAQ", text: "We open at nine." };
const pdfBody = {
  title: "Manual",
  fileName: "Manual v2.pdf",
  contentType: "application/pdf",
  sizeBytes: 1234,
};

beforeEach(() => {
  resetStore();
  signIn(null);
  afterQueue.length = 0;
  processSource.mockClear();
  analytics.track.mockClear();
});

/** No owner route sends CORS headers (project.md §9). */
function expectNoCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
}

describe("safeFileName", () => {
  it("keeps safe characters and the type's own extension", () => {
    expect(safeFileName("Manual v2.PDF")).toBe("Manual_v2.pdf");
    expect(safeFileName("../../etc/passwd.txt")).toBe("etc_passwd.txt");
    expect(safeFileName("Café menu.md")).toBe("Cafe_menu.md");
    expect(safeFileName("日本.txt")).toBe("file.txt");
  });

  it("caps the name's length", () => {
    expect(safeFileName(`${"a".repeat(300)}.txt`)).toBe(`${"a".repeat(100)}.txt`);
  });
});

describe("POST /api/projects/:id/knowledge (paste)", () => {
  it("401s without a session", async () => {
    const p = addProject(A);
    const { status, body } = await read(await paste.POST(post(textBody), ctx(String(p.id))));
    expect(status).toBe(401);
    expect(body).toEqual(errorBody("unauthorized"));
    expect(store.calls).toEqual([]);
  });

  it("400s on a bad id or body", async () => {
    signIn(A);
    const p = addProject(A);
    expect((await paste.POST(post(textBody), ctx("nope"))).status).toBe(400);
    const res = await read(await paste.POST(post({ title: "", text: "x" }), ctx(String(p.id))));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody("invalid_request"));
    expect((await paste.POST(post("{"), ctx(String(p.id)))).status).toBe(400);
  });

  it("404s for another owner's project, before any service-client call", async () => {
    const theirs = addProject(B);
    signIn(A);
    const { status, body } = await read(await paste.POST(post(textBody), ctx(String(theirs.id))));
    expect(status).toBe(404);
    expect(body).toEqual(errorBody("not_found"));
    expect(store.calls.filter((c) => !c.startsWith("owner:"))).toEqual([]);
    expect(store.sources).toEqual([]);
  });

  it("201s with a processing source and processes the pasted text in after()", async () => {
    signIn(A);
    const p = addProject(A);
    const { status, body, res } = await read(await paste.POST(post(textBody), ctx(String(p.id))));
    expect(status).toBe(201);
    expectNoCors(res);
    const row = store.sources[0]!;
    expect(body).toEqual({
      source: {
        id: row.id,
        projectId: p.id,
        title: "FAQ",
        type: "text",
        status: "processing",
        createdAt: row.created_at,
      },
    });
    expect(row.storage_key).toBeNull();

    expect(processSource).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(1);
    await afterQueue[0]!();
    expect(processSource).toHaveBeenCalledWith(row.id, { text: "We open at nine." });
  });

  it("sends knowledge_added once, with the project ID and type only", async () => {
    signIn(A);
    const p = addProject(A);
    await paste.POST(post(textBody), ctx(String(p.id)));
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith("knowledge_added", A, {
      projectId: p.id,
      type: "text",
    });
    // No title or text in the event.
    expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(/FAQ|nine/);
  });

  it("sends no knowledge_added when the paste is refused", async () => {
    signIn(A);
    const p = addProject(A);
    for (let i = 0; i < FREE_LIMIT; i++) addSource(String(p.id));
    expect((await paste.POST(post(textBody), ctx(String(p.id)))).status).toBe(402);
    expect((await paste.POST(post({}), ctx(String(p.id)))).status).toBe(400);
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("402s at the Free limit, and Pro gets its own limit", async () => {
    signIn(A);
    const p = addProject(A);
    for (let i = 0; i < FREE_LIMIT; i++) addSource(String(p.id));
    const { status, body } = await read(await paste.POST(post(textBody), ctx(String(p.id))));
    expect(status).toBe(402);
    expect(body).toEqual(errorBody("plan_limit_reached"));
    expect(afterQueue).toEqual([]);

    store.plans.set(A, "pro");
    expect((await paste.POST(post(textBody), ctx(String(p.id)))).status).toBe(201);
  });

  it("removes stale uploads' files before reserving, and keeps fresh ones", async () => {
    signIn(A);
    const p = addProject(A);
    const other = addProject(B);
    const staleKey = `${p.id}/s1/old.pdf`;
    const freshKey = `${p.id}/s2/new.pdf`;
    const otherKey = `${other.id}/s3/theirs.pdf`;
    for (let i = 0; i < FREE_LIMIT - 1; i++) {
      addSource(String(p.id), { type: "pdf", storage_key: `${p.id}/r${i}/a.pdf` });
    }
    addSource(String(p.id), { type: "pdf", storage_key: staleKey, status: "uploading", created_at: old() });
    addSource(String(other.id), { type: "pdf", storage_key: otherKey, status: "uploading", created_at: old() });
    store.files.set(staleKey, bytes("%PDF-1"));
    store.files.set(otherKey, bytes("%PDF-1"));
    addSource(String(p.id), { type: "pdf", storage_key: freshKey, status: "uploading" });
    store.files.set(freshKey, bytes("%PDF-1"));

    // Reclaiming the stale one still leaves the project at its limit.
    expect((await paste.POST(post(textBody), ctx(String(p.id)))).status).toBe(402);
    expect(store.files.has(staleKey)).toBe(false);
    expect(store.files.has(freshKey)).toBe(true);
    expect(store.files.has(otherKey)).toBe(true);
  });

  it("carries on when the stale cleanup fails", async () => {
    signIn(A);
    const p = addProject(A);
    const staleKey = `${p.id}/s1/old.pdf`;
    addSource(String(p.id), { type: "pdf", storage_key: staleKey, status: "uploading", created_at: old() });
    store.files.set(staleKey, bytes("x"));
    store.fail.add("storage.remove");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await paste.POST(post(textBody), ctx(String(p.id)))).status).toBe(201);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("500s on an unexpected database error", async () => {
    signIn(A);
    const p = addProject(A);
    store.fail.add("rpc.reserve_knowledge_source");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await read(await paste.POST(post(textBody), ctx(String(p.id))));
    expect(status).toBe(500);
    expect(body).toEqual(errorBody("internal_error"));
    log.mockRestore();
  });
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  it("401s without a session", async () => {
    const p = addProject(A);
    expect((await uploadUrl.POST(post(pdfBody), ctx(String(p.id)))).status).toBe(401);
    expect(store.calls).toEqual([]);
  });

  it("refuses a declared size over the limit (413) and a bad type (415)", async () => {
    signIn(A);
    const p = addProject(A);
    const big = await read(
      await uploadUrl.POST(post({ ...pdfBody, sizeBytes: MAX_KNOWLEDGE_FILE_BYTES + 1 }), ctx(String(p.id))),
    );
    expect(big.status).toBe(413);
    expect(big.body).toEqual(errorBody("file_too_large"));

    const exe = await read(
      await uploadUrl.POST(post({ ...pdfBody, fileName: "run.exe" }), ctx(String(p.id))),
    );
    expect(exe.status).toBe(415);
    expect(exe.body).toEqual(errorBody("unsupported_file_type"));

    const mismatch = await uploadUrl.POST(
      post({ ...pdfBody, contentType: "text/plain" }),
      ctx(String(p.id)),
    );
    expect(mismatch.status).toBe(415);
    expect((await uploadUrl.POST(post({ ...pdfBody, title: "" }), ctx(String(p.id)))).status).toBe(400);
    expect(store.sources).toEqual([]);
  });

  it("404s for another owner's project", async () => {
    const theirs = addProject(B);
    signIn(A);
    const { status } = await read(await uploadUrl.POST(post(pdfBody), ctx(String(theirs.id))));
    expect(status).toBe(404);
    expect(store.calls.filter((c) => !c.startsWith("owner:"))).toEqual([]);
  });

  it("reserves an uploading source under <projectId>/<sourceId>/<safe name> and signs that key", async () => {
    signIn(A);
    const p = addProject(A);
    const { status, body, res } = await read(await uploadUrl.POST(post(pdfBody), ctx(String(p.id))));
    expect(status).toBe(201);
    expectNoCors(res);
    const row = store.sources[0]!;
    expect(row.storage_key).toBe(`${p.id}/${row.id}/Manual_v2.pdf`);
    expect(store.signed).toEqual([row.storage_key]);
    expect(body).toEqual({
      source: {
        id: row.id,
        projectId: p.id,
        title: "Manual",
        type: "pdf",
        status: "uploading",
        createdAt: row.created_at,
      },
      uploadUrl: `https://storage.test/upload/sign/knowledge/${row.storage_key}?token=t`,
    });
    expect(afterQueue).toEqual([]);
  });

  it("402s at the limit", async () => {
    signIn(A);
    const p = addProject(A);
    for (let i = 0; i < FREE_LIMIT; i++) addSource(String(p.id));
    const { status, body } = await read(await uploadUrl.POST(post(pdfBody), ctx(String(p.id))));
    expect(status).toBe(402);
    expect(body).toEqual(errorBody("plan_limit_reached"));
    expect(store.signed).toEqual([]);
  });

  it("reclaims a stale reservation and its file to make room", async () => {
    signIn(A);
    const p = addProject(A);
    for (let i = 0; i < FREE_LIMIT - 1; i++) addSource(String(p.id));
    const staleKey = `${p.id}/s1/old.pdf`;
    addSource(String(p.id), { type: "pdf", storage_key: staleKey, status: "uploading", created_at: old() });
    store.files.set(staleKey, bytes("%PDF-1"));

    expect((await uploadUrl.POST(post(pdfBody), ctx(String(p.id)))).status).toBe(201);
    expect(store.files.has(staleKey)).toBe(false);
    expect(store.sources.some((s) => s.storage_key === staleKey)).toBe(false);
    expect(store.sources).toHaveLength(FREE_LIMIT);
  });

  it("drops the reservation when signing fails", async () => {
    signIn(A);
    const p = addProject(A);
    store.fail.add("storage.createSignedUploadUrl");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await uploadUrl.POST(post(pdfBody), ctx(String(p.id)))).status).toBe(500);
    expect(store.sources).toEqual([]);
    log.mockRestore();
  });
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  function upload(projectId: string, over: Record<string, unknown> = {}, content = "%PDF-1.7 ...") {
    const row = addSource(projectId, { type: "pdf", status: "uploading", ...over });
    row.storage_key = over.storage_key ?? `${projectId}/${row.id}/file.${String(row.type)}`;
    store.files.set(String(row.storage_key), bytes(content));
    return row;
  }

  it("401s without a session", async () => {
    const p = addProject(A);
    const s = upload(String(p.id));
    expect((await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id)))).status).toBe(401);
    expect(s.status).toBe("uploading");
  });

  it("400s without a valid source id", async () => {
    signIn(A);
    const p = addProject(A);
    expect((await finalize.POST(post({ sourceId: "x" }), ctx(String(p.id)))).status).toBe(400);
  });

  it("404s for another owner's project, and for a source not in this project", async () => {
    const theirs = addProject(B);
    const theirSource = upload(String(theirs.id));
    signIn(A);
    const mine = addProject(A);

    const other = await finalize.POST(post({ sourceId: theirSource.id }), ctx(String(theirs.id)));
    expect(other.status).toBe(404);
    expect(store.calls.filter((c) => !c.startsWith("owner:"))).toEqual([]);

    // Their source id under my project id: the claim matches nothing.
    const crossed = await read(
      await finalize.POST(post({ sourceId: theirSource.id }), ctx(String(mine.id))),
    );
    expect(crossed.status).toBe(404);
    expect(crossed.body).toEqual(errorBody("not_found"));
    expect(theirSource.status).toBe("uploading");

    expect((await finalize.POST(post({ sourceId: MISSING_ID }), ctx(String(mine.id)))).status).toBe(404);
  });

  it("claims the source, returns it processing, and processes it in after()", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id));
    const { status, body, res } = await read(
      await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id))),
    );
    expect(status).toBe(200);
    expectNoCors(res);
    expect(body).toEqual({
      source: {
        id: s.id,
        projectId: p.id,
        title: "Doc",
        type: "pdf",
        status: "processing",
        createdAt: s.created_at,
      },
    });
    expect(s.status).toBe("processing");
    expect(afterQueue).toHaveLength(1);
    await afterQueue[0]!();
    expect(processSource).toHaveBeenCalledWith(s.id);
  });

  it("sends knowledge_added once on finalize, with no file name", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id), { title: "Manual v2" });
    await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id)));
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith("knowledge_added", A, {
      projectId: p.id,
      type: "pdf",
    });
    expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(/Manual|file\.pdf/);
    // A second finalize is refused (409) and sends nothing more.
    await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id)));
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it("accepts Markdown and TXT without a magic-byte check", async () => {
    signIn(A);
    const p = addProject(A);
    const md = upload(String(p.id), { type: "md" }, "# Hi");
    const txt = upload(String(p.id), { type: "txt" }, "hello");
    expect((await finalize.POST(post({ sourceId: md.id }), ctx(String(p.id)))).status).toBe(200);
    expect((await finalize.POST(post({ sourceId: txt.id }), ctx(String(p.id)))).status).toBe(200);
    expect(store.calls).not.toContain("storage:download");
  });

  it("409s on a second finalize and processes only once", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id));
    expect((await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id)))).status).toBe(200);
    const second = await read(await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id))));
    expect(second.status).toBe(409);
    expect(second.body).toEqual(errorBody("conflict"));
    expect(afterQueue).toHaveLength(1);
  });

  it("409s on a stale reservation", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id), { created_at: old() });
    const { status, body } = await read(await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id))));
    expect(status).toBe(409);
    expect(body).toEqual(errorBody("conflict"));
    expect(s.status).toBe("uploading");
  });

  it("415s a .txt renamed to .pdf and deletes the object and the source", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id), {}, "just some text");
    const { status, body } = await read(await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id))));
    expect(status).toBe(415);
    expect(body).toEqual(errorBody("unsupported_file_type"));
    expect(store.files.has(String(s.storage_key))).toBe(false);
    expect(store.sources).toEqual([]);
    expect(afterQueue).toEqual([]);
  });

  it("413s an object over the limit and deletes the object and the source", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id), { type: "txt" });
    store.files.set(String(s.storage_key), new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1));
    const { status, body } = await read(await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id))));
    expect(status).toBe(413);
    expect(body).toEqual(errorBody("file_too_large"));
    expect(store.files.has(String(s.storage_key))).toBe(false);
    expect(store.sources).toEqual([]);
    expect(afterQueue).toEqual([]);
  });

  it("400s when nothing was uploaded yet, and hands the reservation back", async () => {
    signIn(A);
    const p = addProject(A);
    const s = upload(String(p.id));
    store.files.delete(String(s.storage_key));
    const { status, body } = await read(await finalize.POST(post({ sourceId: s.id }), ctx(String(p.id))));
    expect(status).toBe(400);
    expect(body).toEqual(errorBody("invalid_request"));
    expect(s.status).toBe("uploading");
  });
});

describe("DELETE /api/knowledge/:id", () => {
  const del = (id: string) =>
    remove.DELETE(new Request(`http://localhost/api/knowledge/${id}`, { method: "DELETE" }), ctx(id));

  it("401s without a session", async () => {
    const p = addProject(A);
    const s = addSource(String(p.id));
    expect((await del(String(s.id))).status).toBe(401);
    expect(store.sources).toHaveLength(1);
  });

  it("400s on a bad id", async () => {
    signIn(A);
    expect((await del("nope")).status).toBe(400);
  });

  it("404s for another owner's source, and for a missing one, without service calls", async () => {
    const theirs = addProject(B);
    const s = addSource(String(theirs.id), { type: "pdf", storage_key: `${theirs.id}/x/a.pdf` });
    store.files.set(String(s.storage_key), bytes("%PDF-"));
    signIn(A);
    const { status, body } = await read(await del(String(s.id)));
    expect(status).toBe(404);
    expect(body).toEqual(errorBody("not_found"));
    expect((await del(MISSING_ID)).status).toBe(404);
    expect(store.calls.filter((c) => !c.startsWith("owner:"))).toEqual([]);
    expect(store.sources).toHaveLength(1);
    expect(store.files.size).toBe(1);
  });

  it("deletes the file and the source", async () => {
    signIn(A);
    const p = addProject(A);
    const keep = addSource(String(p.id));
    const s = addSource(String(p.id), { type: "pdf", storage_key: `${p.id}/x/a.pdf` });
    store.files.set(String(s.storage_key), bytes("%PDF-"));
    const { status, body, res } = await read(await del(String(s.id)));
    expect(status).toBe(200);
    expectNoCors(res);
    expect(body).toEqual({ ok: true });
    expect(store.files.size).toBe(0);
    expect(store.sources).toEqual([keep]);
  });

  it("deletes a pasted-text source without touching Storage", async () => {
    signIn(A);
    const p = addProject(A);
    const s = addSource(String(p.id));
    expect((await del(String(s.id))).status).toBe(200);
    expect(store.sources).toEqual([]);
    expect(store.calls.some((c) => c.startsWith("storage:"))).toBe(false);
  });

  it("keeps the row when the file can't be removed, so a retry can finish", async () => {
    signIn(A);
    const p = addProject(A);
    const s = addSource(String(p.id), { type: "pdf", storage_key: `${p.id}/x/a.pdf` });
    store.fail.add("storage.remove");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await del(String(s.id))).status).toBe(500);
    expect(store.sources).toHaveLength(1);
    log.mockRestore();
  });
});
