// @vitest-environment happy-dom
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "../../components/embed";
import { NOTICES } from "../../components/embed/get-reply";

const KEY = "pk_test_0123456789abcdef";
const C1 = "3f0c8d7e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";
const XSS = `<img src=x onerror="alert(1)">`;

type Answer = { status: number; body: unknown } | Error;
const answers: Answer[] = [];
const bodies: Record<string, unknown>[] = [];

const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
  bodies.push(JSON.parse(init.body as string));
  const next = answers.shift() ?? new Error("no answer queued");
  if (next instanceof Error) throw next;
  return new Response(JSON.stringify(next.body), { status: next.status });
});

const ok = (reply: string, conversationId = C1) => ({
  status: 200,
  body: { conversationId, reply },
});
const fail = (status: number, code: string) => ({
  status,
  body: { error: { code, message: "x" } },
});

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Message" }), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
  return user;
}

const log = () => screen.getByRole("log", { name: "Messages" });

beforeEach(() => {
  answers.length = 0;
  bodies.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "postMessage").mockImplementation(() => {});
  render(<ChatPanel config={DEFAULT_WIDGET_CONFIG} publicKey={KEY} />);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("ChatPanel ↔ /api/widget/chat", () => {
  it("shows the reply and threads the conversationId into the next message", async () => {
    answers.push(ok("First answer"), ok("Second answer"));
    await send("one");
    expect(await within(log()).findByText("First answer")).toBeTruthy();
    await send("two");
    expect(await within(log()).findByText("Second answer")).toBeTruthy();

    expect(bodies[0]).toMatchObject({ key: KEY, message: "one" });
    expect(bodies[0]).not.toHaveProperty("conversationId");
    expect(bodies[0].visitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[1]).toMatchObject({ conversationId: C1, message: "two" });
    expect(bodies[1].visitorId).toBe(bodies[0].visitorId);
  });

  it("renders the reply as text, never HTML", async () => {
    answers.push(ok(XSS));
    await send("hi");
    const bubble = await within(log()).findByText(XSS);
    expect(bubble.querySelector("img")).toBeNull();
    expect(log().querySelector("img")).toBeNull();
  });

  it.each([
    [fail(429, "rate_limited"), NOTICES.rate_limited, true],
    [fail(429, "quota_exceeded"), NOTICES.quota_exceeded, false],
    [fail(403, "message_blocked"), NOTICES.message_blocked, false],
    [fail(400, "invalid_request"), NOTICES.too_long, false],
    [fail(404, "not_found"), NOTICES.failed, true],
    [fail(500, "internal_error"), NOTICES.failed, true],
    [new TypeError("Failed to fetch"), NOTICES.failed, true],
  ] as const)(
    "shows the friendly notice for %o",
    async (answer, notice, canRetry) => {
      answers.push(answer);
      await send("hello");
      const alert = await within(log()).findByRole("alert");
      expect(alert.textContent).toContain(notice);
      expect(
        within(alert).queryByRole("button", { name: "Try again" }) !== null,
      ).toBe(canRetry);
      // The visitor can send again.
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveProperty(
        "disabled",
        false,
      );
      expect(screen.queryByText("Typing…")).toBeNull();
    },
  );

  it("Try again resends the same message without a new bubble", async () => {
    answers.push(fail(500, "internal_error"), ok("Recovered"));
    const user = await send("please");
    const alert = await within(log()).findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(log()).findByText("Recovered")).toBeTruthy();
    expect(within(log()).queryByRole("alert")).toBeNull();
    expect(bodies.map((b) => b.message)).toEqual(["please", "please"]);
    expect(within(log()).getAllByText("please")).toHaveLength(1);
  });

  it("a 404 starts a new conversation on the next message", async () => {
    answers.push(ok("Hi"), fail(404, "not_found"), ok("Fresh", "c2"));
    await send("one");
    await within(log()).findByText("Hi");
    await send("two");
    await within(log()).findByRole("alert");
    await send("three");
    await within(log()).findByText("Fresh");
    expect(bodies[1].conversationId).toBe(C1);
    expect(bodies[2]).not.toHaveProperty("conversationId");
  });
});
