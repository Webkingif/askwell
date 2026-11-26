import { describe, expect, it } from "vitest";
import {
  EMBED_MESSAGE_PREFIX,
  EMBED_PATH,
  VISITOR_ID_STORAGE_KEY,
  embedUrl,
  isLoaderToPanelMessage,
  isPanelToLoaderMessage,
  type LoaderToPanelMessage,
  type PanelToLoaderMessage,
} from "./index";

describe("embedUrl", () => {
  it("builds <origin>/embed?key=<key>", () => {
    expect(EMBED_PATH).toBe("/embed");
    expect(embedUrl("https://app.example.com", "pk_abc123")).toBe(
      "https://app.example.com/embed?key=pk_abc123",
    );
  });

  it("ignores a trailing slash on the origin", () => {
    expect(embedUrl("https://app.example.com/", "pk_x")).toBe(
      "https://app.example.com/embed?key=pk_x",
    );
  });

  it("URL-encodes the key", () => {
    const url = embedUrl("https://app.example.com", "pk_a&b=c #d");
    expect(url).toBe("https://app.example.com/embed?key=pk_a%26b%3Dc%20%23d");
    expect(decodeURIComponent(url.split("?key=")[1] ?? "")).toBe("pk_a&b=c #d");
  });
});

describe("constants", () => {
  it("namespace every message type and the storage key", () => {
    expect(EMBED_MESSAGE_PREFIX).toBe("askwell:");
    expect(VISITOR_ID_STORAGE_KEY.startsWith(EMBED_MESSAGE_PREFIX)).toBe(true);
  });
});

describe("isPanelToLoaderMessage", () => {
  const valid: PanelToLoaderMessage[] = [
    { type: "askwell:close" },
    { type: "askwell:resize", height: 480 },
    { type: "askwell:resize", height: 312.5 },
    { type: "askwell:unread", count: 0 },
    { type: "askwell:unread", count: 3 },
  ];
  it.each(valid)("accepts %j", (msg) => {
    expect(isPanelToLoaderMessage(msg)).toBe(true);
    expect(msg.type.startsWith(EMBED_MESSAGE_PREFIX)).toBe(true);
  });

  it("ignores extra fields", () => {
    expect(isPanelToLoaderMessage({ type: "askwell:close", extra: 1 })).toBe(
      true,
    );
  });

  it.each([
    ["unknown type", { type: "askwell:open" }],
    ["un-namespaced type", { type: "close" }],
    ["loader message", { type: "askwell:opened" }],
    ["missing type", { height: 10 }],
    ["non-string type", { type: 1 }],
    ["resize without height", { type: "askwell:resize" }],
    ["resize height as string", { type: "askwell:resize", height: "480" }],
    ["resize height NaN", { type: "askwell:resize", height: NaN }],
    ["resize height Infinity", { type: "askwell:resize", height: Infinity }],
    ["resize height negative", { type: "askwell:resize", height: -1 }],
    ["resize height zero", { type: "askwell:resize", height: 0 }],
    ["unread without count", { type: "askwell:unread" }],
    ["unread count as string", { type: "askwell:unread", count: "2" }],
    ["unread count NaN", { type: "askwell:unread", count: NaN }],
    ["unread count negative", { type: "askwell:unread", count: -1 }],
    ["unread count fractional", { type: "askwell:unread", count: 1.5 }],
    ["unread count Infinity", { type: "askwell:unread", count: Infinity }],
  ])("rejects %s", (_, data) => {
    expect(isPanelToLoaderMessage(data)).toBe(false);
  });

  it.each([
    null,
    undefined,
    "askwell:close",
    42,
    true,
    [],
    [{ type: "askwell:close" }],
  ])("rejects non-object %j", (data) => {
    expect(isPanelToLoaderMessage(data)).toBe(false);
  });
});

describe("isLoaderToPanelMessage", () => {
  it("accepts opened", () => {
    const msg: LoaderToPanelMessage = { type: "askwell:opened" };
    expect(isLoaderToPanelMessage(msg)).toBe(true);
    expect(isLoaderToPanelMessage({ ...msg, extra: true })).toBe(true);
  });

  it.each([
    ["unknown type", { type: "askwell:hello" }],
    ["panel message", { type: "askwell:close" }],
    ["un-namespaced type", { type: "opened" }],
    ["missing type", {}],
    ["non-string type", { type: null }],
  ])("rejects %s", (_, data) => {
    expect(isLoaderToPanelMessage(data)).toBe(false);
  });

  it.each([null, undefined, "askwell:opened", 0, [{ type: "askwell:opened" }]])(
    "rejects non-object %j",
    (data) => {
      expect(isLoaderToPanelMessage(data)).toBe(false);
    },
  );
});
