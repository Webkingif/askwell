import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project } from "@askwell/shared";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const { ProjectList, formatCreated } =
  await import("../../../components/projects");

const project = (id: string, name: string, createdAt: string): Project => ({
  id,
  name,
  publicKey: `pk_${id.replaceAll("-", "")}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00+00:00",
  createdAt,
});

const P1 = project(
  "aaaaaaaa-0000-4000-8000-000000000001",
  "My <b>site</b>",
  "2026-11-26T10:00:00+00:00",
);
const P2 = project(
  "aaaaaaaa-0000-4000-8000-000000000002",
  "Docs",
  "2026-11-20T23:30:00+00:00",
);

describe("ProjectList", () => {
  it("shows the empty state with a create form when there are no projects", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[]} />);
    expect(html).toContain("Create your first project");
    expect(html).toContain('aria-label="New project"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>.*Create project/);
    expect(html).not.toContain('aria-label="Your projects"');
  });

  it("lists each project with a link, created date and actions, in the given order", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[P1, P2]} />);
    expect(html).not.toContain("Create your first project");
    expect(html).toContain('aria-label="Your projects"');
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain(`href="/dashboard/projects/${P1.id}"`);
    expect(html).toContain(`href="/dashboard/projects/${P2.id}"`);
    expect(html.indexOf(P1.id)).toBeLessThan(html.indexOf(P2.id));
    expect(html).toContain(
      `<time dateTime="${P1.createdAt}">Nov 26, 2026</time>`,
    );
    expect(html.match(/>Rename</g)).toHaveLength(2);
    expect(html.match(/>Delete</g)).toHaveLength(2);
    // The create form stays available above the list.
    expect(html).toContain('aria-label="New project"');
  });

  it("renders project names as text, never HTML", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[P1]} />);
    expect(html).toContain("My &lt;b&gt;site&lt;/b&gt;");
    expect(html).not.toContain("<b>site</b>");
  });

  it("limits the name input to the shared max length", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[]} />);
    expect(html).toContain('maxLength="80"');
  });
});

describe("formatCreated", () => {
  it("formats in UTC so server and browser agree", () => {
    expect(formatCreated("2026-11-20T23:30:00+00:00")).toBe("Nov 20, 2026");
    expect(formatCreated("2026-11-20T23:30:00-05:00")).toBe("Nov 21, 2026");
  });
});
