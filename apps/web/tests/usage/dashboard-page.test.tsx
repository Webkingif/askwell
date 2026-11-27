import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { Plan, Project } from "@askwell/shared";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const db = vi.hoisted(() => ({
  projects: [] as Project[],
  plan: "free" as Plan,
  fail: false,
}));
vi.mock("../../lib/projects", () => ({
  listProjects: async () => {
    if (db.fail) throw new Error("projects: list failed (PGRST301)");
    return db.projects;
  },
}));
vi.mock("../../lib/accounts", () => ({
  ensureAccount: async () => ({ clerk_user_id: "user_a", plan: db.plan }),
}));

const { default: DashboardPage } = await import("../../app/dashboard/page");

const project = (id: string, messagesUsed: number): Project => ({
  id,
  name: `Site ${id.slice(-1)}`,
  publicKey: "pk_aaaaaaaaaaaaaaaaaaaa",
  messagesUsed,
  // Always the current month, whenever the test runs.
  periodStart: new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString(),
  createdAt: "2026-11-02T00:00:00+00:00",
});

async function render(): Promise<string> {
  const stream = await renderToReadableStream(<DashboardPage />);
  await stream.allReady;
  return (await new Response(stream).text())
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

beforeEach(() => {
  db.projects = [];
  db.plan = "free";
  db.fail = false;
});

describe("Projects page cards", () => {
  it("show each project's messages against the server-read plan", async () => {
    db.projects = [
      project("aaaaaaaa-0000-4000-8000-000000000001", 3),
      project("aaaaaaaa-0000-4000-8000-000000000002", 100),
    ];
    const t = await render();
    expect(t).toContain("3 / 100 messages this month");
    expect(t).toContain("100 / 100 messages this month · Limit reached");
  });

  it("use the pro limit for a pro owner", async () => {
    db.plan = "pro";
    db.projects = [project("aaaaaaaa-0000-4000-8000-000000000001", 3)];
    expect(await render()).toContain("3 / 2,000 messages this month");
  });

  it("keep the empty and error states", async () => {
    expect(await render()).toContain("Create your first project");
    db.fail = true;
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await render()).toContain("We couldn't load your projects");
  });
});
