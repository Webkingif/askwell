import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_NAME } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const nav = vi.hoisted(() => ({ pathname: "/dashboard" as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

const { Sidebar, ProjectTabs, TabPlaceholder, NavLinksView, SIDEBAR_LINKS } =
  await import("../../components/dashboard");
const { default: ProjectsPage } = await import("../../app/dashboard/page");
const { default: BillingPage } =
  await import("../../app/dashboard/billing/page");
const { default: ProjectIndex } =
  await import("../../app/dashboard/projects/[projectId]/page");
const { default: ProjectsIndex } =
  await import("../../app/dashboard/projects/page");

function links(html: string) {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(
    (m) => ({
      href: m[1],
      text: m[2],
    }),
  );
}

describe("Sidebar", () => {
  it("shows the app name, Projects, Billing and the user menu", () => {
    nav.pathname = "/dashboard";
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain(APP_NAME);
    expect(links(html)).toEqual(
      expect.arrayContaining([
        { href: "/dashboard", text: "Projects" },
        { href: "/dashboard/billing", text: "Billing" },
      ]),
    );
    expect(html).toContain('data-testid="user-button"');
  });

  it("marks the current page", () => {
    nav.pathname = "/dashboard/billing";
    const html = renderToStaticMarkup(
      <NavLinksView
        items={SIDEBAR_LINKS}
        variant="sidebar"
        label="Dashboard"
        pathname="/dashboard/billing"
      />,
    );
    expect(html).toMatch(/aria-current="page"[^>]*>Billing</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>Projects</);
  });

  it("marks nothing in the Suspense fallback", () => {
    const html = renderToStaticMarkup(
      <NavLinksView
        items={SIDEBAR_LINKS}
        variant="sidebar"
        label="Dashboard"
        pathname={null}
      />,
    );
    expect(html).not.toContain("aria-current");
  });
});

describe("ProjectTabs", () => {
  it("renders all five tabs with their routes, current one marked", () => {
    nav.pathname = "/dashboard/projects/p1/install";
    const html = renderToStaticMarkup(<ProjectTabs projectId="p1" />);
    expect(links(html)).toEqual([
      { href: "/dashboard/projects/p1/knowledge", text: "Knowledge" },
      { href: "/dashboard/projects/p1/conversations", text: "Conversations" },
      { href: "/dashboard/projects/p1/customize", text: "Customize" },
      { href: "/dashboard/projects/p1/install", text: "Install" },
      { href: "/dashboard/projects/p1/usage", text: "Usage" },
    ]);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Install</);
  });
});

describe("dashboard pages", () => {
  it("/dashboard shows the projects empty state with a disabled New project button", () => {
    const html = renderToStaticMarkup(<ProjectsPage />);
    expect(html).toContain("Create your first project");
    expect(html).toContain("coming soon");
    const buttons =
      html.match(/<button[^>]*>[^<]*New project<\/button>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toContain("disabled");
  });

  it("/dashboard/billing shows an empty state", () => {
    expect(renderToStaticMarkup(<BillingPage />)).toContain(
      "Plans are coming soon",
    );
  });

  it("each tab has its own empty state", () => {
    for (const tab of [
      "knowledge",
      "conversations",
      "customize",
      "install",
      "usage",
    ] as const) {
      const html = renderToStaticMarkup(<TabPlaceholder tab={tab} />);
      expect(html).toContain("<h3");
    }
  });

  it("a project opens on Knowledge", async () => {
    await expect(
      ProjectIndex({ params: Promise.resolve({ projectId: "p1" }) } as never),
    ).rejects.toThrow("NEXT_REDIRECT /dashboard/projects/p1/knowledge");
  });

  it("titles use APP_NAME", async () => {
    const { metadata: projects } = await import("../../app/dashboard/page");
    const { metadata: layout } = await import("../../app/dashboard/layout");
    expect(projects.title).toBe(`Projects · ${APP_NAME}`);
    // Child pages (billing, tabs) give a short title; the layout template adds APP_NAME.
    expect(layout.title).toMatchObject({ template: `%s · ${APP_NAME}` });
  });

  it("/dashboard/projects goes to the list", () => {
    expect(() => ProjectsIndex()).toThrow("NEXT_REDIRECT /dashboard");
  });
});
