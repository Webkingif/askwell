// Phase 3 "Done when", end to end, with real Gemini and Arcjet (plan.md
// Phase 3, project.md §6.4, §6.6): a PDF uploaded through the owner API →
// a question about it on a plain page on another origin gets the right
// answer; an unrelated question gets "I don't know"; the 21st message in a
// minute is refused with the friendly notice. See README.md.
//
// Setup: a dedicated Clerk dev test user owns one throwaway project per run
// (fresh quota and rate-limit key). The run deletes the source (file and
// chunks) and the project afterwards. Each run spends about 21 real
// messages, all from that throwaway project's quota.
import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type CDPSession,
  type Frame,
  type Page,
} from "@playwright/test";

const PREVIEW_URL = (process.env.PREVIEW_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "";
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
  /\/+$/,
  "",
);
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** The dev test owner. Created on the first run, reused after. */
const OWNER_EMAIL =
  process.env.E2E_OWNER_EMAIL ?? "askwell-e2e-chat+clerk_test@example.com";
const HOST_PORT = Number(process.env.HOST_PORT ?? 4321);
/** The host page for this spec: host.html with the throwaway project's key. */
const HOST_PATH = "/chat-host";
const PROJECT_NAME = "B5 e2e chat";

const FIXTURE = new URL("./fixtures/quillfern-faq.pdf", import.meta.url);
const ON_TOPIC =
  "How long is the frame warranty, and what is your flagship bike called?";
const OFF_TOPIC = "What is the capital of France?";
const RATE_LIMIT_NOTICE =
  "You're sending messages fast. Try again in a minute.";
/** WIDGET_RATE_LIMITS.chat in apps/web/lib/arcjet/protect.ts. */
const CHAT_PER_MINUTE = 20;

// ---------------------------------------------------------------- owner API

const CLERK_API = "https://api.clerk.com/v1";

async function clerk<T>(
  request: APIRequestContext,
  method: "GET" | "POST" | "DELETE",
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(`${CLERK_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    data,
  });
  if (!res.ok()) {
    throw new Error(`Clerk ${method} ${path} → ${res.status()}`);
  }
  return (await res.json()) as T;
}

/** A signed-in owner: a Clerk session, and a fresh token per request. */
class Owner {
  private constructor(
    private readonly request: APIRequestContext,
    private readonly sessionId: string,
  ) {}

  static async signIn(request: APIRequestContext): Promise<Owner> {
    const found = await clerk<{ id: string }[]>(
      request,
      "GET",
      `/users?email_address=${encodeURIComponent(OWNER_EMAIL)}`,
    );
    const userId =
      found[0]?.id ??
      (
        await clerk<{ id: string }>(request, "POST", "/users", {
          email_address: [OWNER_EMAIL],
          skip_password_requirement: true,
        })
      ).id;
    // Backend API sessions exist for testing on development instances.
    const session = await clerk<{ id: string }>(request, "POST", "/sessions", {
      user_id: userId,
    });
    return new Owner(request, session.id);
  }

  /** Session tokens live 60 s, so take a new one for every call. */
  async token(): Promise<string> {
    const { jwt } = await clerk<{ jwt: string }>(
      this.request,
      "POST",
      `/sessions/${this.sessionId}/tokens`,
    );
    return jwt;
  }

  /** Calls an owner route on the preview as this owner. */
  async api<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    data?: unknown,
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.token()}`,
    };
    if (SECRET) headers["x-vercel-protection-bypass"] = SECRET;
    const res = await this.request.fetch(`${PREVIEW_URL}${path}`, {
      method,
      headers,
      data,
    });
    return { status: res.status(), body: (await res.json()) as T };
  }

  /**
   * Reads knowledge_sources as the owner, through Supabase's REST API with
   * the Clerk token (RLS applies). There's no owner GET route for sources.
   */
  private async sources(
    filter: string,
  ): Promise<{ id: string; status: string }[]> {
    const res = await this.request.get(
      `${SUPABASE_URL}/rest/v1/knowledge_sources?select=id,status&${filter}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${await this.token()}`,
        },
      },
    );
    expect(res.status()).toBe(200);
    return (await res.json()) as { id: string; status: string }[];
  }

  async sourceStatus(sourceId: string): Promise<string | undefined> {
    return (await this.sources(`id=eq.${sourceId}`))[0]?.status;
  }

  async sourceIds(projectId: string): Promise<string[]> {
    return (await this.sources(`project_id=eq.${projectId}`)).map((s) => s.id);
  }

  async signOut(): Promise<void> {
    await clerk(this.request, "POST", `/sessions/${this.sessionId}/revoke`);
  }
}

interface ProjectRow {
  id: string;
  name: string;
  publicKey: string;
}

/** Deletes the owner's projects left by an earlier, failed run. */
async function deleteStaleProjects(owner: Owner): Promise<void> {
  const list = await owner.api<{ projects: ProjectRow[] }>(
    "GET",
    "/api/projects",
  );
  expect(list.status).toBe(200);
  for (const p of list.body.projects.filter((p) => p.name === PROJECT_NAME)) {
    // Delete its sources first, so their Storage files go too.
    for (const id of await owner.sourceIds(p.id)) {
      expect((await owner.api("DELETE", `/api/knowledge/${id}`)).status).toBe(
        200,
      );
    }
    expect((await owner.api("DELETE", `/api/projects/${p.id}`)).status).toBe(
      200,
    );
  }
}

/** upload-url → signed PUT → finalize, then wait for `ready`. */
async function uploadPdf(
  owner: Owner,
  request: APIRequestContext,
  projectId: string,
): Promise<string> {
  const pdf = readFileSync(FIXTURE);
  const reserve = await owner.api<{
    source: { id: string; status: string };
    uploadUrl: string;
  }>("POST", `/api/projects/${projectId}/knowledge/upload-url`, {
    title: "Quillfern FAQ (e2e)",
    fileName: "quillfern-faq.pdf",
    contentType: "application/pdf",
    sizeBytes: pdf.length,
  });
  expect(reserve.status).toBe(201);
  expect(reserve.body.source.status).toBe("uploading");
  const sourceId = reserve.body.source.id;

  const put = await request.put(reserve.body.uploadUrl, {
    headers: { "Content-Type": "application/pdf" },
    data: pdf,
  });
  expect(put.status()).toBe(200);

  const finalize = await owner.api<{ source: { status: string } }>(
    "POST",
    `/api/projects/${projectId}/knowledge/finalize`,
    { sourceId },
  );
  expect(finalize.status).toBe(200);
  expect(finalize.body.source.status).toBe("processing");

  await expect
    .poll(() => owner.sourceStatus(sourceId), {
      timeout: 120_000,
      intervals: [2_000],
    })
    .toBe("ready");
  return sourceId;
}

// ------------------------------------------------------------- the widget

/** host.html with the snippet for `key`, served on the host page's origin. */
async function serveHostPage(page: Page, key: string): Promise<void> {
  const template = readFileSync(
    new URL("./host.html", import.meta.url),
    "utf8",
  );
  const snippet = `<script src="${PREVIEW_URL}/widget.js" data-key="${key}" async></script>`;
  await page.route(`http://localhost:${HOST_PORT}${HOST_PATH}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: template.replace("{{SNIPPET}}", snippet),
    }),
  );
}

/**
 * The loader's shadow root is closed; pierce it with CDP to click the
 * button, as widget.spec.ts does.
 */
async function openPanel(page: Page): Promise<Frame> {
  await expect(page.locator("askwell-widget")).toHaveCount(1);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  let box: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
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
        const shadow = node.shadowRoots?.[0];
        if (node.localName === "askwell-widget" && shadow) {
          const { nodeId } = await cdp.send("DOM.querySelector", {
            nodeId: shadow.nodeId,
            selector: ".btn",
          });
          if (!nodeId) return false;
          const { object } = await cdp.send("DOM.resolveNode", { nodeId });
          const { result } = await cdp.send("Runtime.callFunctionOn", {
            objectId: object.objectId!,
            functionDeclaration:
              "function(){const r=this.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}",
            returnByValue: true,
          });
          box = result.value as { x: number; y: number };
          return true;
        }
        stack.push(...(node.children ?? []));
      }
      return false;
    })
    .toBe(true);
  await page.mouse.click(box!.x, box!.y);
  await expect
    .poll(() =>
      page.frames().find((f) => f.url().startsWith(`${PREVIEW_URL}/embed?`)),
    )
    .toBeTruthy();
  return page
    .frames()
    .find((f) => f.url().startsWith(`${PREVIEW_URL}/embed?`))!;
}

/** Sends a message in the panel; resolves with the chat route's response. */
async function ask(page: Page, frame: Frame, text: string) {
  const response = page.waitForResponse(
    (r) =>
      r.url() === `${PREVIEW_URL}/api/widget/chat` &&
      r.request().method() === "POST",
    { timeout: 60_000 },
  );
  const input = frame.getByRole("textbox", { name: "Message" });
  await input.fill(text);
  await input.press("Enter");
  const res = await response;
  // Wait for the panel to finish (the typing bubble goes).
  await expect(frame.getByText("Typing…")).toHaveCount(0, { timeout: 30_000 });
  return res;
}

/** The text of the panel's last bot bubble. */
async function lastReply(frame: Frame): Promise<string> {
  const log = frame.getByRole("log", { name: "Messages" });
  return (await log.locator("li").last().innerText()).trim();
}

// ------------------------------------------------------------------- spec

test.describe.configure({ mode: "serial" });

let owner: Owner;
let project: ProjectRow;
let sourceId: string | undefined;

test.beforeAll(async ({ playwright }) => {
  const missing = Object.entries({
    PREVIEW_URL,
    CLERK_SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Set ${missing.join(", ")}.`);
  if (!PREVIEW_URL.startsWith("https://")) {
    throw new Error("Set PREVIEW_URL to the preview's https:// origin.");
  }
  if (!CLERK_SECRET_KEY.startsWith("sk_test_")) {
    // Backend API sessions are for development instances only.
    throw new Error("CLERK_SECRET_KEY must be the dev instance's (sk_test_).");
  }

  const request = await playwright.request.newContext();
  owner = await Owner.signIn(request);
  await deleteStaleProjects(owner);
  const created = await owner.api<{ project: ProjectRow }>(
    "POST",
    "/api/projects",
    { name: PROJECT_NAME },
  );
  expect(created.status).toBe(201);
  project = created.body.project;
  sourceId = await uploadPdf(owner, request, project.id);
});

test.afterAll(async () => {
  if (!owner) return;
  if (sourceId) {
    // Removes the Storage file, the row and its chunks.
    expect(
      (await owner.api("DELETE", `/api/knowledge/${sourceId}`)).status,
    ).toBe(200);
    expect(await owner.sourceStatus(sourceId)).toBeUndefined();
  }
  if (project) {
    expect(
      (await owner.api("DELETE", `/api/projects/${project.id}`)).status,
    ).toBe(200);
  }
  await owner.signOut();
});

// Previews are protected: add the bypass header to preview requests only.
test.beforeEach(async ({ context }) => {
  if (!SECRET) return;
  await context.route(`${PREVIEW_URL}/**`, (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": SECRET,
      },
    }),
  );
});

test("answers from the PDF, says I don't know, then rate limits", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await serveHostPage(page, project.publicKey);
  await page.goto(HOST_PATH);
  expect(new URL(page.url()).origin).not.toBe(PREVIEW_URL);
  const frame = await openPanel(page);

  // 1. A question the PDF answers: the facts are invented, so only the
  //    uploaded chunks can supply them.
  const first = await ask(page, frame, ON_TOPIC);
  expect(first.status()).toBe(200);
  const answer = await lastReply(frame);
  console.log(`on-topic reply: ${answer}`);
  expect(answer).toContain("Heron 9");
  expect(answer).toMatch(/\b(7|seven)[- ]year/i);

  // 2. An unrelated question, same project: chunks are present, so this goes
  //    through the model, not the no-chunks short-circuit.
  const second = await ask(page, frame, OFF_TOPIC);
  expect(second.status()).toBe(200);
  const refusal = await lastReply(frame);
  console.log(`off-topic reply: ${refusal}`);
  expect(refusal).toMatch(/^I don't know/);

  // 3. Use up the rest of the minute's 20 straight against the route (same
  //    route, key and IP as the panel), then send the 21st in the panel.
  //    The burst only has to get past Arcjet, so any status but 429 counts.
  const { conversationId } = (await first.json()) as { conversationId: string };
  const visitorId = (first.request().postDataJSON() as { visitorId: string })
    .visitorId;
  const burst = await Promise.all(
    Array.from({ length: CHAT_PER_MINUTE - 2 }, (_, i) =>
      request.post(`${PREVIEW_URL}/api/widget/chat`, {
        headers: SECRET ? { "x-vercel-protection-bypass": SECRET } : {},
        data: {
          key: project.publicKey,
          visitorId,
          conversationId,
          message: `Do you sell bike bell number ${i + 3}?`,
        },
      }),
    ),
  );
  const statuses = burst.map((r) => r.status());
  console.log(`burst statuses (messages 3–20): ${statuses.join(" ")}`);
  expect(statuses.filter((s) => s === 429)).toEqual([]);

  const limited = await ask(page, frame, "One more question, please?");
  expect(limited.status()).toBe(429);
  expect(
    ((await limited.json()) as { error: { code: string } }).error.code,
  ).toBe("rate_limited");
  await expect(frame.getByRole("alert")).toContainText(RATE_LIMIT_NOTICE);
  await page.screenshot({ path: test.info().outputPath("rate-limited.png") });

  expect(pageErrors).toEqual([]);
});
