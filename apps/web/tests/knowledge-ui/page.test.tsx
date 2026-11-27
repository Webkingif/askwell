import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const MINE = "aaaaaaaa-0000-4000-8000-000000000001";
const THEIRS = "bbbbbbbb-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  owned: vi.fn<(id: string) => Promise<unknown>>(async () => null),
  plan: "free" as "free" | "pro",
  sources: vi.fn<(id: string) => Promise<unknown[]>>(async () => []),
}));
vi.mock("../../lib/projects", () => ({
  getOwnedProject: (id: string) => mocks.owned(id),
}));
vi.mock("../../lib/accounts", () => ({
  ensureAccount: async () => ({ clerk_user_id: "user_a", plan: mocks.plan }),
}));
vi.mock("../../app/dashboard/projects/[projectId]/knowledge/sources", () => ({
  listSources: (id: string) => mocks.sources(id),
}));

const { default: KnowledgePage } =
  await import("../../app/dashboard/projects/[projectId]/knowledge/page");

async function renderPage(projectId: string): Promise<string> {
  const stream = await renderToReadableStream(
    <KnowledgePage
      params={Promise.resolve({ projectId })}
      searchParams={Promise.resolve({})}
    />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  mocks.plan = "free";
  mocks.owned.mockReset();
  mocks.owned.mockImplementation(async (id) =>
    id === MINE ? { id: MINE } : null,
  );
  mocks.sources.mockReset();
  mocks.sources.mockResolvedValue([
    {
      id: "cccccccc-0000-4000-8000-000000000001",
      projectId: MINE,
      title: "FAQ",
      type: "text",
      status: "ready",
      createdAt: "2026-11-27T10:00:00+00:00",
    },
  ]);
});

describe("Knowledge page", () => {
  it("lists the owner's sources with the Free limit", async () => {
    const html = await renderPage(MINE);
    expect(html).toContain("FAQ");
    expect(html).toContain("1 of 3 sources");
    expect(mocks.sources).toHaveBeenCalledWith(MINE);
  });

  it("uses the Pro limit for a Pro owner", async () => {
    mocks.plan = "pro";
    expect(await renderPage(MINE)).toContain("1 of 25 sources");
  });

  it("shows not found for another owner's project or a bad id, without listing", async () => {
    expect(await renderPage(THEIRS)).toContain("Project not found");
    expect(await renderPage("nope")).toContain("Project not found");
    expect(mocks.sources).not.toHaveBeenCalled();
  });

  it("shows an error state when loading fails", async () => {
    mocks.sources.mockRejectedValue(new Error("boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await renderPage(MINE)).toContain(
      "We couldn&#x27;t load your knowledge",
    );
    log.mockRestore();
  });
});
