import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addConversation,
  addMessage,
  addProject,
  at,
  resetStore,
  store,
} from "./fake-db";

vi.mock("server-only", () => ({}));

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
}));

vi.mock("../../lib/supabase/owner", () => import("./fake-db"));
vi.mock("../../lib/supabase/service", () => import("./fake-db"));

const list = await import("../../app/api/projects/[id]/conversations/route");
const thread = await import("../../app/api/conversations/[id]/route");

const A = "user_a";
const B = "user_b";
const MISSING_ID = "99999999-0000-4000-8000-000000000000";

function signIn(id: string | null) {
  clerk.userId = id;
  store.sub = id;
}

const req = (path: string) => new Request(`http://localhost${path}`);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const getList = (id: string) =>
  list.GET(req(`/api/projects/${id}/conversations`), ctx(id));
const getThread = (id: string) =>
  thread.GET(req(`/api/conversations/${id}`), ctx(id));

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

describe("GET /api/projects/:id/conversations", () => {
  it("lists the project's conversations, newest first, as ConversationSummary", async () => {
    const p = addProject(A);
    const older = addConversation(p.id, at(0));
    addMessage(older.id, "bot", "Welcome", at(1));
    addMessage(older.id, "visitor", "x".repeat(130), at(2));
    const newer = addConversation(p.id, at(3));
    addMessage(newer.id, "visitor", "Do you ship to Canada?", at(4));
    addMessage(newer.id, "bot", "Yes.", at(5));
    signIn(A);

    const { status, body } = await read(await getList(p.id));
    expect(status).toBe(200);
    expect(body).toEqual({
      conversations: [
        {
          id: newer.id,
          visitorId: newer.visitor_id,
          preview: "Do you ship to Canada?",
          messageCount: 2,
          createdAt: at(3),
          lastMessageAt: at(5),
        },
        {
          id: older.id,
          visitorId: older.visitor_id,
          preview: "x".repeat(120),
          messageCount: 2,
          createdAt: at(0),
          lastMessageAt: at(2),
        },
      ],
    });
    expect(store.rpcArgs).toEqual([{ p_project_id: p.id, p_limit: 50 }]);
    expect(store.calls).toEqual(["owner:projects", "owner:rpc:list_conversations"]);
  });

  it("returns [] for a project with no conversations", async () => {
    const p = addProject(A);
    signIn(A);
    const { status, body } = await read(await getList(p.id));
    expect(status).toBe(200);
    expect(body).toEqual({ conversations: [] });
  });

  it("404 for another owner's project, without calling the rpc", async () => {
    const p = addProject(B);
    addConversation(p.id);
    signIn(A);
    const { status, body } = await read(await getList(p.id));
    expect(status).toBe(404);
    expect(body).toEqual(errorBody("not_found"));
    expect(store.calls).toEqual(["owner:projects"]);
  });

  it("404 for an unknown project, the same as another owner's", async () => {
    signIn(A);
    const { status, body } = await read(await getList(MISSING_ID));
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: "not_found", message: "Project not found." } });
  });

  it.each(["not-a-uuid", "123", ""])("400 for a bad id %j", async (id) => {
    signIn(A);
    const { status, body } = await read(await getList(id));
    expect(status).toBe(400);
    expect(body).toEqual(errorBody("invalid_request"));
    expect(store.calls).toEqual([]);
  });

  it("401 when signed out", async () => {
    const p = addProject(A);
    const { status, body } = await read(await getList(p.id));
    expect(status).toBe(401);
    expect(body).toEqual(errorBody("unauthorized"));
    expect(store.calls).toEqual([]);
  });

  it("500 with a generic message when the rpc fails", async () => {
    const p = addProject(A);
    signIn(A);
    store.failOn = {
      target: "rpc:list_conversations",
      error: { code: "42501", message: `permission denied ${p.id}` },
    };
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { status, body } = await read(await getList(p.id));
    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
  });
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation and its messages oldest first", async () => {
    const p = addProject(A);
    const c = addConversation(p.id, at(0));
    const bot = addMessage(c.id, "bot", "<b>Hello</b>", at(2));
    const visitor = addMessage(c.id, "visitor", "Hi <script>", at(1));
    signIn(A);

    const { status, body } = await read(await getThread(c.id));
    expect(status).toBe(200);
    expect(body).toEqual({
      conversation: {
        id: c.id,
        projectId: p.id,
        visitorId: c.visitor_id,
        createdAt: at(0),
      },
      // Bodies come back as stored text; the UI renders them as text.
      messages: [
        { id: visitor.id, role: "visitor", body: "Hi <script>", createdAt: at(1) },
        { id: bot.id, role: "bot", body: "<b>Hello</b>", createdAt: at(2) },
      ],
    });
    expect(store.calls).toEqual(["owner:conversations", "owner:messages"]);
  });

  it("orders messages with the same time by id", async () => {
    const p = addProject(A);
    const c = addConversation(p.id);
    const first = addMessage(c.id, "visitor", "Q", at(1));
    const second = addMessage(c.id, "bot", "A", at(1));
    signIn(A);
    const { body } = await read(await getThread(c.id));
    expect((body as { messages: { id: string }[] }).messages.map((m) => m.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("returns an empty thread for a conversation with no messages", async () => {
    const p = addProject(A);
    const c = addConversation(p.id);
    signIn(A);
    const { status, body } = await read(await getThread(c.id));
    expect(status).toBe(200);
    expect(body).toMatchObject({ conversation: { id: c.id }, messages: [] });
  });

  it("404 for another owner's conversation, the same as a missing one", async () => {
    const p = addProject(B);
    const c = addConversation(p.id);
    addMessage(c.id, "visitor", "secret", at(1));
    signIn(A);

    const other = await read(await getThread(c.id));
    const missing = await read(await getThread(MISSING_ID));
    expect(other).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Conversation not found." } },
    });
    expect(missing).toEqual(other);
    expect(store.calls).toEqual(["owner:conversations", "owner:conversations"]);
  });

  it.each(["not-a-uuid", "123", ""])("400 for a bad id %j", async (id) => {
    signIn(A);
    const { status, body } = await read(await getThread(id));
    expect(status).toBe(400);
    expect(body).toEqual(errorBody("invalid_request"));
    expect(store.calls).toEqual([]);
  });

  it("401 when signed out", async () => {
    const p = addProject(A);
    const c = addConversation(p.id);
    const { status, body } = await read(await getThread(c.id));
    expect(status).toBe(401);
    expect(body).toEqual(errorBody("unauthorized"));
    expect(store.calls).toEqual([]);
  });

  it("500 with a generic message when reading messages fails", async () => {
    const p = addProject(A);
    const c = addConversation(p.id);
    signIn(A);
    store.failOn = {
      target: "messages",
      error: { code: "PGRST301", message: `JWT invalid for ${c.id}` },
    };
    const log = vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { status, body } = await read(await getThread(c.id));
    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    // The logged error names the failure, never the id.
    const logged = log.mock.calls[0]![0] as Error;
    expect(logged.message).toBe("conversations: read messages failed (PGRST301)");
  });
});

describe("lib/conversations", () => {
  it("uses only the owner client", async () => {
    const src = await readFile(
      new URL("../../lib/conversations.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("createOwnerClient");
    expect(src).not.toMatch(/createServiceClient|supabase\/service/);
  });

  it("toMessage rejects a role outside MESSAGE_ROLES", async () => {
    const { toMessage } = await import("../../lib/conversations");
    expect(() =>
      toMessage({ id: MISSING_ID, role: "system", body: "x", created_at: at(0) }),
    ).toThrow("conversations: unknown message role");
  });
});
