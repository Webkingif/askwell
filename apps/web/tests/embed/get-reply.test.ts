import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_PATH,
  NOTICES,
  ReplyError,
  createGetReply,
  getReply,
  type ReplyFailure,
} from "../../components/embed/get-reply";

const REQUEST = {
  key: "pk_test_0123456789abcdef",
  visitorId: "8a6e0804-2bd0-4672-b79d-d97027f9071b",
  message: "Do you ship abroad?",
};
const CONVERSATION = "3f0c8d7e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const apiError = (status: number, code: string) =>
  json(status, { error: { code, message: "server text, not shown" } });

async function failureOf(res: Response | Error): Promise<ReplyFailure> {
  const fetchMock = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  const err = await createGetReply(fetchMock)(REQUEST).catch((e) => e);
  expect(err).toBeInstanceOf(ReplyError);
  return (err as ReplyError).failure;
}

afterEach(() => vi.unstubAllGlobals());

describe("getReply", () => {
  it("POSTs the contract body to the same-origin chat route", async () => {
    const fetchMock = vi.fn(async () =>
      json(200, { conversationId: CONVERSATION, reply: "Yes, to the EU." }),
    );
    const res = await createGetReply(fetchMock)({
      ...REQUEST,
      conversationId: CONVERSATION,
    });
    expect(res).toEqual({
      conversationId: CONVERSATION,
      reply: "Yes, to the EU.",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(CHAT_PATH);
    expect(url).toBe("/api/widget/chat");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      ...REQUEST,
      conversationId: CONVERSATION,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits conversationId on the first message", async () => {
    const fetchMock = vi.fn(async () =>
      json(200, { conversationId: CONVERSATION, reply: "Hi" }),
    );
    await createGetReply(fetchMock)(REQUEST);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).not.toHaveProperty(
      "conversationId",
    );
  });

  it("uses the global fetch by default", async () => {
    const fetchMock = vi.fn(async () =>
      json(200, { conversationId: CONVERSATION, reply: "Hi" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getReply(REQUEST)).resolves.toMatchObject({ reply: "Hi" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each<[string, Response, ReplyFailure]>([
    [
      "429 rate_limited",
      apiError(429, "rate_limited"),
      { notice: NOTICES.rate_limited, retry: true, resetConversation: false },
    ],
    [
      "429 quota_exceeded",
      apiError(429, "quota_exceeded"),
      {
        notice: NOTICES.quota_exceeded,
        retry: false,
        resetConversation: false,
      },
    ],
    [
      "403 message_blocked",
      apiError(403, "message_blocked"),
      {
        notice: NOTICES.message_blocked,
        retry: false,
        resetConversation: false,
      },
    ],
    [
      "400 invalid_request",
      apiError(400, "invalid_request"),
      { notice: NOTICES.too_long, retry: false, resetConversation: false },
    ],
    [
      "404 not_found",
      apiError(404, "not_found"),
      { notice: NOTICES.failed, retry: true, resetConversation: true },
    ],
    [
      "500 internal_error",
      apiError(500, "internal_error"),
      { notice: NOTICES.failed, retry: true, resetConversation: false },
    ],
    [
      "502 with an HTML body",
      new Response("<html>Bad gateway</html>", { status: 502 }),
      { notice: NOTICES.failed, retry: true, resetConversation: false },
    ],
    [
      "429 without a body (e.g. a proxy)",
      new Response(null, { status: 429 }),
      { notice: NOTICES.rate_limited, retry: true, resetConversation: false },
    ],
    [
      "200 that breaks the contract",
      json(200, { reply: 42 }),
      { notice: NOTICES.failed, retry: true, resetConversation: false },
    ],
  ])("maps %s to its friendly notice", async (_, res, expected) => {
    expect(await failureOf(res)).toEqual(expected);
  });

  it("maps a network failure to 'Something went wrong', retryable", async () => {
    expect(await failureOf(new TypeError("Failed to fetch"))).toEqual({
      notice: NOTICES.failed,
      retry: true,
      resetConversation: false,
    });
  });

  it("has the friendly texts the task names", () => {
    expect(NOTICES).toMatchObject({
      rate_limited: expect.stringMatching(
        /sending messages fast.*try again in a minute/i,
      ),
      quota_exceeded: "This assistant has reached its message limit.",
      message_blocked: "I can't help with that.",
      too_long: expect.stringMatching(/too long.*1,000 characters/),
      failed: expect.stringMatching(/^Something went wrong/),
    });
  });
});
