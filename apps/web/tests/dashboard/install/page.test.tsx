import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
}));

const MINE = "aaaaaaaa-0000-4000-8000-000000000001";
const THEIRS = "bbbbbbbb-0000-4000-8000-000000000001";
const KEY = "pk_aaaaaaaaaaaaaaaaaaaa";

const owned = vi.hoisted(() => ({
  fn: vi.fn(async (_id: string): Promise<unknown> => null),
}));
vi.mock("../../../lib/projects", () => ({
  getOwnedProject: (id: string) => owned.fn(id),
}));

const { default: InstallPage } =
  await import("../../../app/dashboard/projects/[projectId]/install/page");

async function renderPage(projectId: string): Promise<string> {
  const stream = await renderToReadableStream(
    <InstallPage
      params={Promise.resolve({ projectId })}
      searchParams={Promise.resolve({})}
    />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  owned.fn.mockReset();
  // RLS: only MINE is visible to the signed-in owner.
  owned.fn.mockImplementation(async (id: string) =>
    id === MINE
      ? {
          id: MINE,
          name: "Mine",
          publicKey: KEY,
          messagesUsed: 0,
          periodStart: "2026-11-01T00:00:00Z",
          createdAt: "2026-11-26T00:00:00Z",
        }
      : null,
  );
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_URL", "");
});

describe("Install page", () => {
  it("shows the snippet with the project's key and this deployment's origin", async () => {
    vi.stubEnv("VERCEL_URL", "askwell-abc123.vercel.app");
    const html = await renderPage(MINE);
    expect(html).toContain(
      `&lt;script src=&quot;https://askwell-abc123.vercel.app/widget.js&quot; data-key=&quot;${KEY}&quot; async&gt;&lt;/script&gt;`,
    );
    expect(owned.fn).toHaveBeenCalledWith(MINE);
  });

  it("prefers NEXT_PUBLIC_APP_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://askwell.example.com");
    vi.stubEnv("VERCEL_URL", "askwell-abc123.vercel.app");
    expect(await renderPage(MINE)).toContain(
      "https://askwell.example.com/widget.js",
    );
  });

  it("uses the request host locally", async () => {
    expect(await renderPage(MINE)).toContain("http://localhost:3000/widget.js");
  });

  it("shows not found for another owner's project, with no snippet", async () => {
    const html = await renderPage(THEIRS);
    expect(html).toContain("Project not found");
    expect(html).not.toContain("widget.js");
  });

  it("shows not found for a malformed id without querying", async () => {
    const html = await renderPage("not-a-uuid");
    expect(html).toContain("Project not found");
    expect(owned.fn).not.toHaveBeenCalled();
  });

  it("shows an error state when the read fails", async () => {
    owned.fn.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const html = await renderPage(MINE);
    expect(html).toContain("We couldn&#x27;t load this project");
    expect(html).not.toContain("widget.js");
  });
});
