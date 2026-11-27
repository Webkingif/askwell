import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { Plan, Project } from "@askwell/shared";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const MINE = "aaaaaaaa-0000-4000-8000-000000000001";
const THEIRS = "bbbbbbbb-0000-4000-8000-000000000001";

const db = vi.hoisted(() => ({
  project: null as Project | null,
  plan: "free" as Plan,
  fail: false,
}));
vi.mock("../../lib/projects", () => ({
  // RLS: only MINE is visible to the signed-in owner.
  getOwnedProject: async (id: string) => {
    if (db.fail) throw new Error("projects: read failed (PGRST301)");
    return id === MINE ? db.project : null;
  },
}));
vi.mock("../../lib/accounts", () => ({
  ensureAccount: async () => ({ clerk_user_id: "user_a", plan: db.plan }),
}));

const { default: UsagePage } =
  await import("../../app/dashboard/projects/[projectId]/usage/page");
const { ProjectList } = await import("../../components/projects");

const project = (
  messagesUsed: number,
  periodStart = "2026-11-01T00:00:00+00:00",
): Project => ({
  id: MINE,
  name: "Mine",
  publicKey: "pk_aaaaaaaaaaaaaaaaaaaa",
  messagesUsed,
  periodStart,
  createdAt: "2026-11-02T00:00:00+00:00",
});

async function renderPage(projectId: string): Promise<string> {
  const stream = await renderToReadableStream(
    <UsagePage
      params={Promise.resolve({ projectId })}
      searchParams={Promise.resolve({})}
    />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

/** Visible text, without tags or React's text separators. */
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T15:00:00Z"));
  db.project = project(42);
  db.plan = "free";
  db.fail = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Usage tab", () => {
  it("shows used / limit, a progress bar and the reset date", async () => {
    const html = await renderPage(MINE);
    const t = text(html);
    expect(t).toContain("42 / 100 messages this month");
    expect(t).toContain("Resets on Dec 1, 2026 (UTC).");
    expect(t).toContain("Free plan: 100 messages per project each month.");
    expect(html).toMatch(
      /role="progressbar"[^>]*aria-valuemax="100"[^>]*aria-valuenow="42"/,
    );
    expect(html).toContain("width:42%");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("TabPlaceholder");
    expect(t).not.toContain("No usage yet");
  });

  it("uses the pro limit for a pro owner", async () => {
    db.plan = "pro";
    db.project = project(1200);
    const t = text(await renderPage(MINE));
    expect(t).toContain("1,200 / 2,000 messages this month");
    expect(t).toContain("Pro plan: 2,000 messages");
  });

  it("shows 0 used when period_start is in a past month", async () => {
    db.project = project(100, "2026-10-01T00:00:00+00:00");
    const html = await renderPage(MINE);
    const t = text(html);
    expect(t).toContain("0 / 100 messages this month");
    expect(t).toContain("No messages yet this month");
    expect(html).toContain(
      'href="/dashboard/projects/aaaaaaaa-0000-4000-8000-000000000001/install"',
    );
    expect(html).not.toContain('role="alert"');
  });

  it("at the limit, says the widget shows visitors the quota message", async () => {
    db.project = project(100);
    const html = await renderPage(MINE);
    const t = text(html);
    expect(t).toContain("100 / 100 messages this month");
    expect(html).toContain('role="alert"');
    expect(t).toContain(
      "This project has used all 100 messages for this month.",
    );
    expect(t).toContain(
      "the widget shows visitors a message that it has reached its limit",
    );
    expect(t).toContain("Upgrade to Pro");
    expect(html).toContain("width:100%");
  });

  it("caps the bar at 100% when over the limit, and Pro gets no upgrade link", async () => {
    db.plan = "pro";
    db.project = project(2100);
    const html = await renderPage(MINE);
    expect(html).toContain("width:100%");
    expect(html).toMatch(/aria-valuenow="2000"/);
    expect(html).toContain('role="alert"');
    expect(text(html)).not.toContain("Upgrade to Pro");
  });

  it("shows not found for another owner's project and a bad id", async () => {
    for (const id of [THEIRS, "not-a-uuid"]) {
      const t = text(await renderPage(id));
      expect(t).toContain("Project not found");
      expect(t).not.toContain("messages this month");
    }
  });

  it("shows an error state when the read fails, without details", async () => {
    db.fail = true;
    const log = vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const t = text(await renderPage(MINE));
    expect(t).toContain("We couldn't load your usage");
    expect(t).not.toContain("PGRST301");
    expect(log).toHaveBeenCalledOnce();
  });

  it("has a loading state", () => {
    // renderToStaticMarkup can't wait for data, so it renders the Suspense
    // fallback: what streams first on a real request.
    const html = renderToStaticMarkup(
      <UsagePage
        params={new Promise(() => {})}
        searchParams={Promise.resolve({})}
      />,
    );
    expect(html).toContain('role="status"');
    expect(text(html)).toContain("Loading your usage");
  });
});

describe("Project cards", () => {
  const now = new Date("2026-11-27T15:00:00Z");

  it("show this month's used / limit and link to the Usage tab", () => {
    const html = renderToStaticMarkup(
      <ProjectList projects={[project(7)]} plan="free" now={now} />,
    );
    expect(text(html)).toContain("7 / 100 messages this month");
    expect(html).toContain(
      'href="/dashboard/projects/aaaaaaaa-0000-4000-8000-000000000001/usage"',
    );
    expect(text(html)).not.toContain("Limit reached");
  });

  it("flag a project at its limit and reset a past month to 0", () => {
    const full = renderToStaticMarkup(
      <ProjectList projects={[project(100)]} plan="free" now={now} />,
    );
    expect(text(full)).toContain(
      "100 / 100 messages this month · Limit reached",
    );
    const old = renderToStaticMarkup(
      <ProjectList
        projects={[project(100, "2026-10-01T00:00:00Z")]}
        plan="pro"
        now={now}
      />,
    );
    expect(text(old)).toContain("0 / 2,000 messages this month");
  });

  it("show no usage line without a plan", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[project(7)]} />);
    expect(html).not.toContain("messages this month");
  });
});
