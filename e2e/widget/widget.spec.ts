// Phase 2 "Done when", end to end: a plain page on another origin shows the
// widget button, the panel opens and shows a mock reply (plan.md Phase 2,
// project.md §6.5, §6.9, §9). Runs against a Vercel preview; see README.md.
import {
  expect,
  test,
  type CDPSession,
  type Frame,
  type Page,
} from "@playwright/test";

const PREVIEW_URL = (process.env.PREVIEW_URL ?? "").replace(/\/+$/, "");
/**
 * Where the snippet's widget.js comes from. The Install tab on a preview
 * points at the per-deployment URL (VERCEL_URL), which can differ from the
 * branch alias in PREVIEW_URL, so read it from the snippet.
 */
const APP_ORIGIN = (() => {
  const src = process.env.WIDGET_SNIPPET?.match(/\ssrc="([^"]+)"/)?.[1];
  return src ? new URL(src).origin : PREVIEW_URL;
})();
const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const HAS_KEY = Boolean(process.env.WIDGET_KEY || process.env.WIDGET_SNIPPET);
const MOCK_REPLY = "Thanks! Real answers arrive soon.";

test.beforeAll(() => {
  if (!PREVIEW_URL.startsWith("https://")) {
    throw new Error("Set PREVIEW_URL to the preview's https:// origin.");
  }
  if (!HAS_KEY) throw new Error("Set WIDGET_KEY (or WIDGET_SNIPPET).");
});

// Previews are protected. Add the bypass header at the network layer, to
// requests for the preview host only. The page's own fetch doesn't set it,
// so this adds no CORS preflight, and no app code changes.
test.beforeEach(async ({ context }) => {
  if (!SECRET) return;
  for (const origin of new Set([PREVIEW_URL, APP_ORIGIN])) {
    await context.route(`${origin}/**`, (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-vercel-protection-bypass": SECRET,
        },
      }),
    );
  }
});

/**
 * The loader's shadow root is closed, so page scripts (and Playwright's
 * selectors) can't reach in. DevTools can: pierce it with CDP, the way a
 * person inspecting the page would.
 */
class Shadow {
  private constructor(
    private readonly cdp: CDPSession,
    private readonly rootId: number,
  ) {}

  static async attach(page: Page): Promise<Shadow | null> {
    const cdp = await page.context().newCDPSession(page);
    const { root } = await cdp.send("DOM.getDocument", {
      depth: -1,
      pierce: true,
    });
    type Node = (typeof root)["children"] extends (infer N)[] | undefined
      ? N
      : never;
    const stack: Node[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.localName === "askwell-widget" && node.shadowRoots?.length) {
        return new Shadow(cdp, node.shadowRoots[0]!.nodeId);
      }
      stack.push(...(node.children ?? []));
    }
    return null;
  }

  private async objectId(selector: string): Promise<string> {
    const { nodeId } = await this.cdp.send("DOM.querySelector", {
      nodeId: this.rootId,
      selector,
    });
    if (!nodeId) throw new Error(`no ${selector} in the widget`);
    const { object } = await this.cdp.send("DOM.resolveNode", { nodeId });
    return object.objectId!;
  }

  /** Runs `fn` with `this` = the element inside the shadow root. */
  async call<T>(selector: string, fn: string): Promise<T> {
    const { result, exceptionDetails } = await this.cdp.send(
      "Runtime.callFunctionOn",
      {
        objectId: await this.objectId(selector),
        functionDeclaration: fn,
        returnByValue: true,
      },
    );
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value as T;
  }

  /** Clicks the element's centre with the real mouse. */
  async click(page: Page, selector: string): Promise<void> {
    const box = await this.call<{ x: number; y: number }>(
      selector,
      "function(){const r=this.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}",
    );
    await page.mouse.click(box.x, box.y);
  }

  isOpen(): Promise<boolean> {
    return this.call<boolean>(
      ".panel",
      "function(){return this.classList.contains('open') && getComputedStyle(this).visibility==='visible'}",
    );
  }
}

async function waitForShadow(page: Page): Promise<Shadow> {
  await expect(page.locator("askwell-widget")).toHaveCount(1);
  let shadow: Shadow | null = null;
  await expect
    .poll(async () => (shadow = await Shadow.attach(page)) !== null)
    .toBe(true);
  return shadow!;
}

function embedFrame(page: Page): Frame | undefined {
  return page.frames().find((f) => f.url().startsWith(`${APP_ORIGIN}/embed`));
}

async function hostStyles(page: Page) {
  return page.evaluate(() => {
    const pick = (id: string, props: string[]) => {
      const s = getComputedStyle(document.getElementById(id)!);
      return Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]));
    };
    return {
      body: pick("title", ["font-family", "color"]),
      button: pick("styled", [
        "background-color",
        "color",
        "font-size",
        "font-family",
        "border-radius",
      ]),
      box: pick("box", ["border-top-color", "border-top-width"]),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      styleSheets: document.styleSheets.length,
    };
  });
}

test("the widget works on a plain page on another origin", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/");
  expect(new URL(page.url()).origin).not.toBe(PREVIEW_URL);

  // The button appears inside the widget's host element, in a closed root.
  const shadow = await waitForShadow(page);
  expect(
    await page.locator("askwell-widget").evaluate((el) => el.shadowRoot),
  ).toBeNull();
  const button = await shadow.call<{ text: string; bg: string; pos: string }>(
    ".btn",
    "function(){const s=getComputedStyle(this);return {text:this.textContent,bg:s.backgroundColor,pos:s.position}}",
  );
  expect(button.text).toContain("Chat with us");
  expect(button.pos).toBe("fixed");
  // The page's `button { background: green !important }` doesn't reach it.
  expect(button.bg).not.toBe("rgb(0, 128, 0)");

  // The host page's own styles are unchanged.
  expect(await hostStyles(page)).toEqual({
    body: { "font-family": "Georgia, serif", color: "rgb(40, 40, 120)" },
    button: {
      "background-color": "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      "font-size": "20px",
      "font-family": "Georgia, serif",
      "border-radius": "0px",
    },
    box: { "border-top-color": "rgb(255, 0, 0)", "border-top-width": "3px" },
    bodyBg: "rgb(255, 250, 240)",
    styleSheets: 1,
  });

  // Click opens the iframe at /embed?key=…
  expect(await shadow.isOpen()).toBe(false);
  await shadow.click(page, ".btn");
  expect(await shadow.isOpen()).toBe(true);
  // A frame the browser couldn't load shows chrome-error://, not /embed.
  await expect
    .poll(() =>
      page
        .frames()
        .map((f) => f.url())
        .filter((u) => u !== page.url()),
    )
    .toEqual([expect.stringContaining(`${APP_ORIGIN}/embed?key=`)]);
  const frame = embedFrame(page)!;

  // The panel got the loader's handshake on the first open: its close
  // button shows (PPW-T13).
  const close = frame.getByRole("button", { name: "Close chat" });
  await expect(close).toBeVisible({ timeout: 5_000 });

  // The panel's ack (askwell:resize with its own height) doesn't shrink it.
  const panelHeight = () =>
    shadow.call<number>(
      ".panel",
      "function(){return Math.round(this.getBoundingClientRect().height)}",
    );
  const expected = Math.min(600, page.viewportSize()!.height - 112);
  await expect.poll(panelHeight).toBe(expected);

  // Typing a message shows typing, then the mock reply.
  const input = frame.getByLabel("Message");
  await input.fill("Hello from another origin <b>hi</b>");
  await input.press("Enter");
  await expect(frame.getByText("Typing…")).toBeAttached();
  await expect(frame.getByText(MOCK_REPLY)).toBeVisible();
  await expect(frame.getByText("Typing…")).toHaveCount(0);
  await expect(
    frame.getByText("Hello from another origin <b>hi</b>"),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("panel-open.png"),
  });

  // The panel's close button closes it (askwell:close to the loader).
  await close.click();
  await expect.poll(() => shadow.isOpen()).toBe(false);

  // Reopening keeps the conversation.
  await shadow.click(page, ".btn");
  await expect.poll(() => shadow.isOpen()).toBe(true);
  await expect(embedFrame(page)!.getByText(MOCK_REPLY)).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("a malformed data-key renders nothing and fetches nothing", async ({
  page,
}) => {
  const configCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/widget/config")) configCalls.push(r.url());
  });
  const script = page.waitForResponse((r) => r.url().endsWith("/widget.js"));
  await page.goto("/bad-key");
  expect((await script).status()).toBe(200);
  // Give the loader time to run (it would fetch the config at once).
  await page.waitForTimeout(2000);
  expect(configCalls).toEqual([]);
  await expect(page.locator("askwell-widget")).toHaveCount(0);
});

test("an unknown key renders nothing", async ({ page }) => {
  const config = page.waitForResponse((r) =>
    r.url().includes("/api/widget/config"),
  );
  await page.goto("/unknown-key");
  expect((await config).status()).toBe(404);
  await page.waitForTimeout(1000);
  await expect(page.locator("askwell-widget")).toHaveCount(0);
  expect(embedFrame(page)).toBeUndefined();
});

test.describe("framing", () => {
  test("headers: /dashboard refuses framing, /embed allows it", async ({
    request,
  }) => {
    const headers: Record<string, string> = SECRET
      ? { "x-vercel-protection-bypass": SECRET }
      : {};
    const dash = await request.get(`${PREVIEW_URL}/dashboard`, {
      headers,
      maxRedirects: 0,
    });
    expect(dash.headers()["content-security-policy"]).toBe(
      "frame-ancestors 'self'",
    );
    expect(dash.headers()["x-frame-options"]).toBe("SAMEORIGIN");

    const embed = await request.get(`${PREVIEW_URL}/embed?key=x`, {
      headers,
    });
    expect(embed.headers()["content-security-policy"]).toBe(
      "frame-ancestors *",
    );
    expect(embed.headers()["x-frame-options"]).toBeUndefined();
  });

  test("browser: another origin can't frame /dashboard", async ({ page }) => {
    await page.goto(
      `/frame?src=${encodeURIComponent(`${PREVIEW_URL}/dashboard`)}`,
    );
    // Chromium replaces a frame its CSP refuses with its error page.
    await expect
      .poll(() => page.frames()[1]?.url())
      .toBe("chrome-error://chromewebdata/");
  });

  test("browser: another origin can frame /embed", async ({ page }) => {
    await page.goto(
      `/frame?src=${encodeURIComponent(`${PREVIEW_URL}/embed?key=bad`)}`,
    );
    await expect(
      page.frameLocator("#f").getByText("This chat isn't available"),
    ).toBeVisible();
  });
});
