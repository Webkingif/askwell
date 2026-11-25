import { describe, expect, it } from "vitest";
import {
  BILLING_PATH,
  PROJECT_TABS,
  SIDEBAR_LINKS,
  isNavActive,
  projectPath,
  projectTabPath,
  projectTabs,
} from "../../components/dashboard/nav";

describe("dashboard nav", () => {
  it("has Projects and Billing in the sidebar", () => {
    expect(SIDEBAR_LINKS).toEqual([
      { href: "/dashboard", label: "Projects" },
      { href: "/dashboard/billing", label: "Billing" },
    ]);
    expect(BILLING_PATH).toBe("/dashboard/billing");
  });

  it("builds the five project tab routes", () => {
    expect(PROJECT_TABS.map((t) => t.slug)).toEqual([
      "knowledge",
      "conversations",
      "customize",
      "install",
      "usage",
    ]);
    expect(projectTabs("p1").map((t) => t.href)).toEqual([
      "/dashboard/projects/p1/knowledge",
      "/dashboard/projects/p1/conversations",
      "/dashboard/projects/p1/customize",
      "/dashboard/projects/p1/install",
      "/dashboard/projects/p1/usage",
    ]);
  });

  it("encodes the project id", () => {
    expect(projectPath("a b/c")).toBe("/dashboard/projects/a%20b%2Fc");
    expect(projectTabPath("x", "usage")).toBe("/dashboard/projects/x/usage");
  });

  describe("isNavActive", () => {
    const [projects, billing] = SIDEBAR_LINKS as [
      (typeof SIDEBAR_LINKS)[number],
      (typeof SIDEBAR_LINKS)[number],
    ];
    const on = (path: string) =>
      SIDEBAR_LINKS.filter((l) => isNavActive(path, l, SIDEBAR_LINKS)).map(
        (l) => l.label,
      );

    it("lights Projects on the list and inside a project", () => {
      expect(on("/dashboard")).toEqual(["Projects"]);
      expect(on("/dashboard/")).toEqual(["Projects"]);
      expect(on("/dashboard/projects/p1/usage")).toEqual(["Projects"]);
    });

    it("lights only Billing on billing", () => {
      expect(on("/dashboard/billing")).toEqual(["Billing"]);
    });

    it("matches by path segment", () => {
      expect(isNavActive("/dashboard/billingx", billing, SIDEBAR_LINKS)).toBe(
        false,
      );
      expect(isNavActive("/dashboardx", projects, SIDEBAR_LINKS)).toBe(false);
    });

    it("respects exact", () => {
      const item = { href: "/a", label: "A", exact: true };
      expect(isNavActive("/a", item)).toBe(true);
      expect(isNavActive("/a/b", item)).toBe(false);
    });

    it("lights one tab per tab route", () => {
      const tabs = projectTabs("p1");
      const active = tabs.filter((t) =>
        isNavActive("/dashboard/projects/p1/customize", t, tabs),
      );
      expect(active.map((t) => t.label)).toEqual(["Customize"]);
    });
  });
});
