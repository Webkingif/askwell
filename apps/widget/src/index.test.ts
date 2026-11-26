import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  type WidgetConfig,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boot, findScript, resetBootFlag, type Widget } from "./index";

const APP = "https://app.example.com";
const KEY = "pk_test_0123456789abcdef";

function addScript(attrs: { src?: string; key?: string } = {}) {
  const s = document.createElement("script");
  // type="text/plain" keeps happy-dom from trying to load it.
  s.type = "text/plain";
  s.setAttribute("src", attrs.src ?? `${APP}/widget.js`);
  if (attrs.key !== undefined) s.dataset.key = attrs.key;
  document.head.appendChild(s);
  return s;
}

function okFetch(config: Partial<WidgetConfig> = {}) {
  const body: WidgetConfigResponse = {
    config: { ...DEFAULT_WIDGET_CONFIG, ...config },
  };
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

function hosts() {
  return document.querySelectorAll("askwell-widget");
}

function sendMessage(data: unknown, origin: string, source: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin,
      source: source as MessageEventSource,
    }),
  );
}

let widget: Widget | null = null;
let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  widget?.destroy();
  widget = null;
  resetBootFlag();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function bootOk(config: Partial<WidgetConfig> = {}) {
  const script = addScript({ key: KEY });
  const fetchFn = okFetch(config);
  widget = await boot({ script, fetch: fetchFn });
  if (!widget) throw new Error("widget did not render");
  return { widget, fetchFn };
}

describe("findScript", () => {
  it("falls back to the widget.js tag with data-key", () => {
    addScript({ src: `${APP}/other.js`, key: KEY });
    const s = addScript({ key: KEY });
    expect(findScript(document)).toBe(s);
  });
});

describe("renders nothing", () => {
  it.each([
    ["no data-key", undefined],
    ["empty key", ""],
    ["wrong prefix", "sk_test_0123456789abcdef"],
    ["too short", "pk_short"],
    ["bad characters", "pk_0123456789abcdef<x>"],
  ])("for %s", async (_, key) => {
    const script = addScript({ key });
    const fetchFn = okFetch();
    expect(await boot({ script, fetch: fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(hosts()).toHaveLength(0);
  });

  it("when no script tag is found", async () => {
    expect(await boot({ script: null, fetch: okFetch() })).toBeNull();
    expect(hosts()).toHaveLength(0);
  });

  it.each([
    ["404", () => new Response("{}", { status: 404 })],
    ["500", () => new Response("{}", { status: 500 })],
    ["non-JSON body", () => new Response("<html>", { status: 200 })],
    ["empty object", () => Response.json({})],
    [
      "bad color",
      () =>
        Response.json({
          config: { ...DEFAULT_WIDGET_CONFIG, buttonColor: "red" },
        }),
    ],
    [
      "unknown position",
      () =>
        Response.json({
          config: { ...DEFAULT_WIDGET_CONFIG, position: "middle" },
        }),
    ],
    [
      "unknown animation",
      () =>
        Response.json({
          config: { ...DEFAULT_WIDGET_CONFIG, animation: "spin" },
        }),
    ],
  ])("when the config response is %s", async (_, respond) => {
    const script = addScript({ key: KEY });
    const fetchFn = vi.fn<typeof fetch>(async () => respond());
    expect(await boot({ script, fetch: fetchFn })).toBeNull();
    expect(hosts()).toHaveLength(0);
    expect(debug).toHaveBeenCalledExactlyOnceWith(
      `${APP_NAME} widget: config unavailable`,
    );
  });

  it("when fetch rejects (network error)", async () => {
    const script = addScript({ key: KEY });
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await boot({ script, fetch: fetchFn })).toBeNull();
    expect(hosts()).toHaveLength(0);
    expect(debug).toHaveBeenCalledOnce();
  });
});

describe("config fetch", () => {
  it("calls the config route on the script's origin, without cookies", async () => {
    const { fetchFn } = await bootOk();
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${APP}/api/widget/config?key=${KEY}`);
    expect(init?.credentials).toBe("omit");
  });
});

describe("button", () => {
  it("lives in a shadow root on one host element", async () => {
    const { widget } = await bootOk();
    expect(hosts()).toHaveLength(1);
    expect(widget.host.parentElement).toBe(document.body);
    // Closed root: page scripts can't reach in.
    expect(widget.host.shadowRoot).toBeNull();
    expect(widget.button.getRootNode()).toBe(widget.root);
    expect(document.querySelector("button")).toBeNull();
    expect(widget.host.children).toHaveLength(0);
  });

  it("uses the config's color, label and position", async () => {
    const { widget } = await bootOk({
      buttonColor: "#ff6600",
      label: "Help <b>me</b>",
      position: "top-left",
    });
    // Label is text, never HTML.
    expect(widget.button.textContent).toBe("Help <b>me</b>");
    expect(widget.button.querySelector("b")).toBeNull();
    const css = widget.root.querySelector("style")!.textContent!;
    expect(css).toMatch(/\.btn\{position:fixed;top:20px;left:20px;/);
    expect(css).toContain("background:#ff6600");
  });

  it("adds no styles to the host page", async () => {
    const before = document.querySelectorAll("style, link").length;
    const { widget } = await bootOk();
    expect(document.querySelectorAll("style, link").length).toBe(before);
    expect(document.documentElement.getAttribute("style")).toBeNull();
    expect(document.body.getAttribute("style")).toBeNull();
    expect(widget.root.querySelectorAll("style")).toHaveLength(1);
  });

  it("renders once when the script runs twice", async () => {
    await bootOk();
    const again = addScript({ key: KEY });
    const fetchFn = okFetch();
    expect(await boot({ script: again, fetch: fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(hosts()).toHaveLength(1);
  });

  it("renders once when two copies start at the same time", async () => {
    const s1 = addScript({ key: KEY });
    const s2 = addScript({ key: KEY });
    const [a, b] = await Promise.all([
      boot({ script: s1, fetch: okFetch() }),
      boot({ script: s2, fetch: okFetch() }),
    ]);
    widget = a ?? b;
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(hosts()).toHaveLength(1);
  });
});

describe("panel", () => {
  it("opens an iframe at /embed?key=… with the configured animation", async () => {
    const { widget } = await bootOk({ animation: "slide" });
    expect(widget.iframe).toBeNull();
    widget.button.click();
    expect(widget.isOpen).toBe(true);
    expect(widget.iframe?.getAttribute("src")).toBe(`${APP}/embed?key=${KEY}`);
    expect(widget.panel.classList.contains("anim-slide")).toBe(true);
    expect(widget.panel.classList.contains("open")).toBe(true);
    expect(widget.button.getAttribute("aria-expanded")).toBe("true");
  });

  it.each(["fade", "scale"] as const)("uses the %s animation", async (a) => {
    const { widget } = await bootOk({ animation: a });
    expect(widget.panel.classList.contains(`anim-${a}`)).toBe(true);
  });

  it("closes on a second click and keeps the iframe", async () => {
    const { widget } = await bootOk();
    widget.button.click();
    const frame = widget.iframe;
    widget.button.click();
    expect(widget.isOpen).toBe(false);
    expect(widget.panel.classList.contains("open")).toBe(false);
    widget.button.click();
    expect(widget.iframe).toBe(frame);
    expect(widget.root.querySelectorAll("iframe")).toHaveLength(1);
  });
});

describe("messages", () => {
  async function openWidget() {
    const { widget } = await bootOk();
    widget.button.click();
    // Iframe loading is off in tests (no network), so happy-dom gives the
    // frame no window. Stand in one: the loader only compares it by
    // identity and posts to it.
    const source = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(widget.iframe!, "contentWindow", { value: source });
    return { widget, source };
  }

  it("askwell:close from the panel closes it", async () => {
    const { widget, source } = await openWidget();
    sendMessage({ type: "askwell:close" }, APP, source);
    expect(widget.isOpen).toBe(false);
  });

  it("ignores a message from another origin", async () => {
    const { widget, source } = await openWidget();
    sendMessage({ type: "askwell:close" }, "https://evil.example", source);
    sendMessage(
      { type: "askwell:close" },
      "https://customer.example.org",
      source,
    );
    expect(widget.isOpen).toBe(true);
  });

  it("ignores a message from another window", async () => {
    const { widget } = await openWidget();
    sendMessage({ type: "askwell:close" }, APP, window);
    sendMessage({ type: "askwell:close" }, APP, null);
    expect(widget.isOpen).toBe(true);
  });

  it("ignores messages before the iframe exists", async () => {
    const { widget } = await bootOk();
    sendMessage({ type: "askwell:unread", count: 2 }, APP, null);
    expect(widget.root.querySelector<HTMLElement>(".dot")!.hidden).toBe(true);
  });

  it("ignores invalid or foreign messages", async () => {
    const { widget, source } = await openWidget();
    for (const data of [
      "askwell:close",
      { type: "close" },
      { type: "askwell:resize", height: -5 },
      { type: "askwell:resize", height: "9999" },
      null,
    ]) {
      sendMessage(data, APP, source);
    }
    expect(widget.isOpen).toBe(true);
    expect(widget.panel.style.height).toBe("");
  });

  it("askwell:resize sets the panel height", async () => {
    const { widget, source } = await openWidget();
    sendMessage({ type: "askwell:resize", height: 420.4 }, APP, source);
    expect(widget.panel.style.height).toBe("420px");
  });

  it("askwell:unread shows a dot while closed; opening clears it", async () => {
    const { widget, source } = await openWidget();
    const dot = widget.root.querySelector<HTMLElement>(".dot")!;
    sendMessage({ type: "askwell:unread", count: 2 }, APP, source);
    expect(dot.hidden).toBe(true); // open: nothing unread to show
    widget.close();
    sendMessage({ type: "askwell:unread", count: 2 }, APP, source);
    expect(dot.hidden).toBe(false);
    expect(widget.button.getAttribute("aria-label")).toContain("2 unread");
    sendMessage({ type: "askwell:unread", count: 0 }, APP, source);
    expect(dot.hidden).toBe(true);
    sendMessage({ type: "askwell:unread", count: 1 }, APP, source);
    widget.open();
    expect(dot.hidden).toBe(true);
  });

  it("posts askwell:opened to the app origin, never *", async () => {
    const { widget, source } = await openWidget();
    const post = vi.mocked(source.postMessage);
    widget.iframe!.dispatchEvent(new Event("load"));
    widget.close();
    widget.open();
    expect(post).toHaveBeenCalledTimes(2);
    for (const call of post.mock.calls) {
      expect(call).toEqual([{ type: "askwell:opened" }, APP]);
    }
  });

  it("destroy removes the listener and the host", async () => {
    const { widget, source } = await openWidget();
    widget.destroy();
    expect(hosts()).toHaveLength(0);
    sendMessage({ type: "askwell:close" }, APP, source);
    expect(widget.isOpen).toBe(true);
  });
});
