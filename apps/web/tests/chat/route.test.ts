import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PROJECT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const KEY = "pk_a9dd4aef5bc946b19f8b58275770de6a";
const VISITOR = "8a6e0804-2bd0-4672-b79d-d97027f9071b";
const CONVERSATION = "3f0c8d7e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";
const NEW_CONVERSATION = "4a1d9e8f-2c3b-4d5e-9f0a-1b2c3d4e5f60";
const VECTOR = [0.6, 0.8];

/** Everything the route does, in order, so tests can check the step order. */
const s = vi.hoisted(() => ({
  events: [] as string[],
  protect: { allowed: true } as
    { allowed: true } | { allowed: false; reason: "rate_limit" | "injection" },
  protectArgs: [] as Record<string, unknown>[],
  projects: new Map<
    string,
    { id: string; accounts: { plan: string } | null }
  >(),
  conversations: [] as { id: string; project_id: string; visitor_id: string }[],
  allowed: true,
  chunks: [] as {
    id: string;
    source_id: string;
    content: string;
    similarity: number;
  }[],
  rpcArgs: {} as Record<string, Record<string, unknown>>,
  answer: null as null | Error,
  embedError: null as null | Error,
}));

vi.mock("../../lib/arcjet/protect", () => ({
  protectWidgetRequest: async (
    _req: Request,
    options: Record<string, unknown>,
  ) => {
    s.events.push("protect");
    s.protectArgs.push(options);
    return s.protect;
  },
}));

vi.mock("../../lib/ai/embed", () => ({
  embedQuery: async (q: string) => {
    s.events.push(`embed:${q}`);
    if (s.embedError) throw s.embedError;
    return VECTOR;
  },
}));

vi.mock("../../lib/ai/answer", () => ({
  answerFromChunks: async (question: string, chunks: { content: string }[]) => {
    s.events.push(`answer:${chunks.length}`);
    if (s.answer) throw s.answer;
    return {
      reply: chunks.length
        ? `From ${chunks.length} chunks: ${question}`
        : "I don't know",
      model: "gemini-test",
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 12,
    };
  },
}));

vi.mock("../../lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => {
        const filters: [string, string][] = [];
        const q = {
          eq: (col: string, value: string) => {
            filters.push([col, value]);
            return q;
          },
          maybeSingle: async () => {
            s.events.push(`read:${table}`);
            const has = (c: string, v: string) =>
              filters.some(([fc, fv]) => fc === c && fv === v);
            if (table === "projects") {
              const key = filters.find(([c]) => c === "public_key")?.[1] ?? "";
              return { data: s.projects.get(key) ?? null, error: null };
            }
            const row = s.conversations.find(
              (c) =>
                has("id", c.id) &&
                has("project_id", c.project_id) &&
                has("visitor_id", c.visitor_id),
            );
            return { data: row ? { id: row.id } : null, error: null };
          },
        };
        return q;
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      s.events.push(`rpc:${name}`);
      s.rpcArgs[name] = args;
      if (name === "consume_message") {
        return {
          data: [{ allowed: s.allowed, messages_used: 3 }],
          error: null,
        };
      }
      if (name === "match_chunks") return { data: s.chunks, error: null };
      if (name === "save_chat_turn") {
        return {
          data: args.p_conversation_id ?? NEW_CONVERSATION,
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  }),
}));

const route = await import("../../app/api/widget/chat/route");
const { PLAN_LIMITS } = await import("@askwell/shared");

function post(body: unknown, raw?: string) {
  return route.POST(
    new Request("https://app.example.com/api/widget/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://shop.example",
      },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

const valid = (extra: Record<string, unknown> = {}) => ({
  key: KEY,
  visitorId: VISITOR,
  message: "Do you ship abroad?",
  ...extra,
});

const aiCalls = () => s.events.filter((e) => /^(embed|answer):/.test(e));
const counted = () => s.events.includes("rpc:consume_message");

beforeEach(() => {
  s.events = [];
  s.protect = { allowed: true };
  s.protectArgs = [];
  s.projects = new Map([[KEY, { id: PROJECT_ID, accounts: { plan: "free" } }]]);
  s.conversations = [
    { id: CONVERSATION, project_id: PROJECT_ID, visitor_id: VISITOR },
  ];
  s.allowed = true;
  s.chunks = [
    {
      id: "c1",
      source_id: "s1",
      content: "We ship to the EU.",
      similarity: 0.9,
    },
  ];
  s.rpcArgs = {};
  s.answer = null;
  s.embedError = null;
});

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({
    error: { code, message: expect.any(String) },
  });
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
}

describe("POST /api/widget/chat: happy path", () => {
  it("runs the steps in §6.6 order and saves both messages", async () => {
    const res = await post(valid());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversationId: NEW_CONVERSATION,
      reply: "From 1 chunks: Do you ship abroad?",
    });
    expect(s.events).toEqual([
      "protect",
      "read:projects",
      "rpc:consume_message",
      "embed:Do you ship abroad?",
      "rpc:match_chunks",
      "answer:1",
      "rpc:save_chat_turn",
    ]);
    expect(s.rpcArgs.save_chat_turn).toEqual({
      p_project_id: PROJECT_ID,
      p_visitor_id: VISITOR,
      p_conversation_id: null,
      p_visitor_body: "Do you ship abroad?",
      p_bot_body: "From 1 chunks: Do you ship abroad?",
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("protects with route chat, the public key and the message", async () => {
    await post(valid());
    expect(s.protectArgs).toEqual([
      { route: "chat", publicKey: KEY, message: "Do you ship abroad?" },
    ]);
  });

  it("retrieves the top 5 chunks of this project with the question's embedding", async () => {
    await post(valid());
    expect(s.rpcArgs.match_chunks).toEqual({
      p_project_id: PROJECT_ID,
      p_embedding: "[0.6,0.8]",
      p_count: 5,
    });
  });

  it("continues an existing conversation of this project", async () => {
    const res = await post(valid({ conversationId: CONVERSATION }));
    expect(res.status).toBe(200);
    expect((await res.json()).conversationId).toBe(CONVERSATION);
    expect(s.events.slice(0, 3)).toEqual([
      "protect",
      "read:projects",
      "read:conversations",
    ]);
    expect(s.rpcArgs.save_chat_turn.p_conversation_id).toBe(CONVERSATION);
  });

  it.each(["free", "pro"] as const)(
    "counts against the %s plan's monthly limit, read on the server",
    async (plan) => {
      s.projects.set(KEY, { id: PROJECT_ID, accounts: { plan } });
      await post(valid());
      expect(s.rpcArgs.consume_message).toEqual({
        p_project_id: PROJECT_ID,
        p_limit: PLAN_LIMITS[plan].messagesPerMonth,
      });
    },
  );

  it("an unknown or missing plan gets Free's limit", async () => {
    s.projects.set(KEY, { id: PROJECT_ID, accounts: null });
    await post(valid({ plan: "pro" }));
    expect(s.rpcArgs.consume_message.p_limit).toBe(
      PLAN_LIMITS.free.messagesPerMonth,
    );
  });
});

describe("refusals happen before counting and before the AI", () => {
  it.each([
    ["not JSON", undefined, "{nope"],
    ["missing key", { visitorId: VISITOR, message: "hi" }, undefined],
    ["bad visitorId", valid({ visitorId: "nope" }), undefined],
    ["empty message", valid({ message: "   " }), undefined],
    [
      "message over 1,000 chars",
      valid({ message: "x".repeat(1001) }),
      undefined,
    ],
    ["bad conversationId", valid({ conversationId: "c1" }), undefined],
  ])("400 for %s: not protected, counted or answered", async (_, body, raw) => {
    await expectError(await post(body, raw), 400, "invalid_request");
    expect(s.events).toEqual([]);
  });

  it("429 rate_limited when Arcjet rate limits", async () => {
    s.protect = { allowed: false, reason: "rate_limit" };
    await expectError(await post(valid()), 429, "rate_limited");
    expect(s.events).toEqual(["protect"]);
  });

  it("403 message_blocked on prompt injection", async () => {
    s.protect = { allowed: false, reason: "injection" };
    await expectError(await post(valid()), 403, "message_blocked");
    expect(s.events).toEqual(["protect"]);
  });

  it("404 for an unknown key", async () => {
    await expectError(
      await post(valid({ key: "pk_00000000000000000000000000000000" })),
      404,
      "not_found",
    );
    expect(counted()).toBe(false);
    expect(aiCalls()).toEqual([]);
  });

  it("404 for another project's conversationId, before counting", async () => {
    s.conversations.push({
      id: "5b2e0f9a-3d4c-4e5f-a01b-2c3d4e5f6071",
      project_id: OTHER_PROJECT_ID,
      visitor_id: VISITOR,
    });
    await expectError(
      await post(
        valid({ conversationId: "5b2e0f9a-3d4c-4e5f-a01b-2c3d4e5f6071" }),
      ),
      404,
      "not_found",
    );
    expect(counted()).toBe(false);
    expect(aiCalls()).toEqual([]);
  });

  it("404 for another visitor's conversation in the same project", async () => {
    s.conversations[0].visitor_id = "11111111-2222-4333-8444-555555555555";
    await expectError(
      await post(valid({ conversationId: CONVERSATION })),
      404,
      "not_found",
    );
    expect(counted()).toBe(false);
  });

  it("429 quota_exceeded over the monthly limit: counted check, no AI", async () => {
    s.allowed = false;
    await expectError(await post(valid()), 429, "quota_exceeded");
    expect(s.events.at(-1)).toBe("rpc:consume_message");
    expect(aiCalls()).toEqual([]);
    expect(s.events).not.toContain("rpc:save_chat_turn");
  });
});

describe("answering", () => {
  it('no chunks → "I don\'t know", saved, with no chat-model call', async () => {
    s.chunks = [];
    const res = await post(valid());
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("I don't know");
    // answerFromChunks short-circuits on no chunks (tested in tests/ai).
    expect(s.events).toContain("answer:0");
    expect(s.rpcArgs.save_chat_turn.p_bot_body).toBe("I don't know");
  });

  it("a model error → 500, and the message stays counted", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    s.answer = new Error("Gemini 503");
    await expectError(await post(valid()), 500, "internal_error");
    expect(counted()).toBe(true);
    expect(s.events).not.toContain("rpc:save_chat_turn");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("an embedding error → 500 after counting", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    s.embedError = new Error("embed down");
    await expectError(await post(valid()), 500, "internal_error");
    expect(counted()).toBe(true);
    err.mockRestore();
  });
});

describe("CORS", () => {
  it("OPTIONS preflight allows any origin, POST and Content-Type, no credentials", async () => {
    const res = route.OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "Content-Type",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
