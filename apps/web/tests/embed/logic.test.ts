import {
  MAX_MESSAGE_LENGTH,
  VISITOR_ID_STORAGE_KEY,
  widgetChatRequestSchema,
} from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEND_ERROR,
  chatReducer,
  cleanMessage,
  initialChatState,
} from "../../components/embed/chat-state";
import {
  MOCK_DELAY_MAX,
  MOCK_DELAY_MIN,
  MOCK_REPLY,
  getReply,
} from "../../components/embed/get-reply";
import {
  connectToParent,
  type LinkWindow,
} from "../../components/embed/parent-link";
import {
  getVisitorId,
  resetMemoryVisitorId,
  type VisitorStorage,
} from "../../components/embed/visitor";

const UUID = /^[0-9a-f-]{36}$/;

function memoryStorage(): VisitorStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("getVisitorId", () => {
  beforeEach(() => resetMemoryVisitorId());

  it("creates a UUID, stores it, and reuses it on the next visit", () => {
    const storage = memoryStorage();
    const first = getVisitorId(storage);
    expect(first).toMatch(UUID);
    expect(storage.data.get(VISITOR_ID_STORAGE_KEY)).toBe(first);
    expect(getVisitorId(storage)).toBe(first);
    // The chat route accepts it.
    expect(
      widgetChatRequestSchema.safeParse({
        key: "pk_test_0123456789abcdef",
        visitorId: first,
        message: "hi",
      }).success,
    ).toBe(true);
  });

  it("replaces a stored value that isn't a UUID", () => {
    const storage = memoryStorage();
    storage.setItem(VISITOR_ID_STORAGE_KEY, "<script>");
    const id = getVisitorId(storage);
    expect(id).toMatch(UUID);
    expect(storage.data.get(VISITOR_ID_STORAGE_KEY)).toBe(id);
  });

  it("falls back to one in-memory ID when storage throws or is missing", () => {
    const broken: VisitorStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    const a = getVisitorId(broken);
    expect(a).toMatch(UUID);
    expect(getVisitorId(broken)).toBe(a);
    expect(getVisitorId(null)).toBe(a);
  });
});

describe("chat state", () => {
  it("send → typing → reply", () => {
    let s = chatReducer(initialChatState, {
      type: "sent",
      id: "1",
      text: "hi",
    });
    expect(s.typing).toBe(true);
    expect(s.messages).toEqual([{ id: "1", role: "visitor", text: "hi" }]);
    s = chatReducer(s, {
      type: "replied",
      id: "2",
      text: MOCK_REPLY,
      conversationId: "c1",
    });
    expect(s.typing).toBe(false);
    expect(s.conversationId).toBe("c1");
    expect(s.messages.map((m) => m.role)).toEqual(["visitor", "bot"]);
  });

  it("a failed send stops typing and shows an error; the next send clears it", () => {
    let s = chatReducer(initialChatState, {
      type: "sent",
      id: "1",
      text: "hi",
    });
    s = chatReducer(s, { type: "failed", error: SEND_ERROR });
    expect(s.typing).toBe(false);
    expect(s.error).toBe(SEND_ERROR);
    s = chatReducer(s, { type: "sent", id: "2", text: "again" });
    expect(s.error).toBeNull();
  });

  it("cleanMessage trims and enforces the length limit", () => {
    expect(cleanMessage("  hi  ")).toBe("hi");
    expect(cleanMessage("   ")).toBeNull();
    expect(cleanMessage("x".repeat(MAX_MESSAGE_LENGTH))).toHaveLength(
      MAX_MESSAGE_LENGTH,
    );
    expect(cleanMessage("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull();
  });
});

describe("getReply (mock)", () => {
  afterEach(() => vi.useRealTimers());

  it("answers with the fixed reply after 600–900 ms and keeps the conversation", async () => {
    vi.useFakeTimers();
    const req = {
      key: "pk_test_0123456789abcdef",
      visitorId: crypto.randomUUID(),
      message: "hi",
    };
    let done = false;
    const p = getReply(req).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MIN - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MAX - MOCK_DELAY_MIN + 1);
    const res = await p;
    expect(res.reply).toBe(MOCK_REPLY);
    expect(res.conversationId).toMatch(UUID);

    const again = getReply({ ...req, conversationId: res.conversationId });
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MAX);
    expect((await again).conversationId).toBe(res.conversationId);
  });
});

describe("connectToParent", () => {
  const HOST = "https://customer.example.org";

  function fakeWindow() {
    const parent = { postMessage: vi.fn() };
    let listener: ((e: MessageEvent) => void) | null = null;
    const win: LinkWindow = {
      parent,
      addEventListener: (_t, l) => {
        listener = l;
      },
      removeEventListener: (_t, l) => {
        if (listener === l) listener = null;
      },
    };
    const deliver = (data: unknown, origin: string, source: unknown) =>
      listener?.({ data, origin, source } as MessageEvent);
    return { win, parent, deliver, hasListener: () => listener !== null };
  }

  it("sends nothing before the handshake", () => {
    const { win, parent } = fakeWindow();
    const link = connectToParent(win, () => {});
    expect(link.send({ type: "askwell:close" })).toBe(false);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it("learns the host origin from askwell:opened and posts only there", () => {
    const { win, parent, deliver } = fakeWindow();
    const onMessage = vi.fn();
    const link = connectToParent(win, onMessage);
    deliver({ type: "askwell:opened" }, HOST, parent);
    expect(link.parentOrigin).toBe(HOST);
    expect(onMessage).toHaveBeenCalledWith({ type: "askwell:opened" });
    expect(link.send({ type: "askwell:close" })).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: "askwell:close" },
      HOST,
    );
    for (const call of parent.postMessage.mock.calls) {
      expect(call[1]).not.toBe("*");
    }
  });

  it("ignores messages that aren't from window.parent", () => {
    const { win, deliver } = fakeWindow();
    const onMessage = vi.fn();
    const link = connectToParent(win, onMessage);
    deliver({ type: "askwell:opened" }, HOST, {});
    deliver({ type: "askwell:opened" }, HOST, null);
    expect(link.parentOrigin).toBeNull();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("ignores invalid messages and an opaque origin", () => {
    const { win, parent, deliver } = fakeWindow();
    const onMessage = vi.fn();
    const link = connectToParent(win, onMessage);
    deliver({ type: "askwell:close" }, HOST, parent);
    deliver("askwell:opened", HOST, parent);
    deliver({ type: "askwell:opened" }, "null", parent);
    expect(link.parentOrigin).toBeNull();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("keeps the first origin and ignores later ones", () => {
    const { win, parent, deliver } = fakeWindow();
    const onMessage = vi.fn();
    const link = connectToParent(win, onMessage);
    deliver({ type: "askwell:opened" }, HOST, parent);
    deliver({ type: "askwell:opened" }, "https://evil.example", parent);
    expect(link.parentOrigin).toBe(HOST);
    expect(onMessage).toHaveBeenCalledOnce();
  });

  it("stop removes the listener", () => {
    const { win, hasListener } = fakeWindow();
    connectToParent(win, () => {}).stop();
    expect(hasListener()).toBe(false);
  });
});
