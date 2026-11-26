// @vitest-environment happy-dom
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { ChatPanel } from "../../components/embed";

const HOST = "https://customer.example.org";
const KEY = "pk_test_0123456789abcdef";

// In this test window, window.parent is window itself (no real iframe).
let post: MockInstance<typeof window.postMessage>;

function fromParent(data: unknown, origin = HOST, source: unknown = window) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin,
        source: source as MessageEventSource,
      }),
    );
  });
}

beforeEach(() => {
  post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
  render(<ChatPanel config={DEFAULT_WIDGET_CONFIG} publicKey={KEY} />);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const resizeCalls = () =>
  post.mock.calls.filter(
    ([msg]) => (msg as { type?: string }).type === "askwell:resize",
  );

describe("panel ack of askwell:opened (PPW-T13)", () => {
  it("replies with askwell:resize to the learned origin", () => {
    fromParent({ type: "askwell:opened" });
    expect(resizeCalls()).toHaveLength(1);
    const [msg, target] = resizeCalls()[0]!;
    expect(target).toBe(HOST);
    expect(msg).toEqual({
      type: "askwell:resize",
      height: expect.any(Number),
    });
    expect((msg as { height: number }).height).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Close chat" })).toBeTruthy();
  });

  it("acks every repeated opened, always to the first origin", () => {
    fromParent({ type: "askwell:opened" });
    fromParent({ type: "askwell:opened" });
    fromParent({ type: "askwell:opened" }, "https://evil.example");
    expect(resizeCalls()).toHaveLength(2);
    for (const [, target] of resizeCalls()) expect(target).toBe(HOST);
  });

  it("sends nothing for an opened that isn't from window.parent", () => {
    fromParent({ type: "askwell:opened" }, HOST, {});
    fromParent({ type: "askwell:opened" }, HOST, null);
    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close chat" })).toBeNull();
  });

  it("never posts to *", () => {
    fromParent({ type: "askwell:opened" });
    for (const [, target] of post.mock.calls) expect(target).not.toBe("*");
  });
});
