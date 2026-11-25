import { DASHBOARD_PATH } from "../../lib/auth/routes";

export interface NavItem {
  href: string;
  label: string;
  /** Active only on this exact path, not on paths below it. */
  exact?: boolean;
}

export const BILLING_PATH = `${DASHBOARD_PATH}/billing`;

/** Sidebar links. Projects stays active inside a project too. */
export const SIDEBAR_LINKS: readonly NavItem[] = [
  { href: DASHBOARD_PATH, label: "Projects" },
  { href: BILLING_PATH, label: "Billing" },
];

export const PROJECT_TABS = [
  { slug: "knowledge", label: "Knowledge" },
  { slug: "conversations", label: "Conversations" },
  { slug: "customize", label: "Customize" },
  { slug: "install", label: "Install" },
  { slug: "usage", label: "Usage" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["slug"];

/** The tab a project opens on. */
export const DEFAULT_PROJECT_TAB: ProjectTab = "knowledge";

export function projectPath(projectId: string): string {
  return `${DASHBOARD_PATH}/projects/${encodeURIComponent(projectId)}`;
}

export function projectTabPath(projectId: string, tab: ProjectTab): string {
  return `${projectPath(projectId)}/${tab}`;
}

export function projectTabs(projectId: string): NavItem[] {
  return PROJECT_TABS.map(({ slug, label }) => ({
    href: projectTabPath(projectId, slug),
    label,
  }));
}

/**
 * Whether a nav item is active for the current path. Matches by path
 * segment, so /dashboard/billingx doesn't light up Billing.
 * Billing is more specific than Projects (/dashboard), so Projects
 * isn't active on /dashboard/billing.
 */
export function isNavActive(
  pathname: string,
  item: NavItem,
  siblings: readonly NavItem[] = [],
): boolean {
  const path = trimSlash(pathname);
  const href = trimSlash(item.href);
  const under = (h: string) => path === h || path.startsWith(`${h}/`);
  if (item.exact) return path === href;
  if (!under(href)) return false;
  // A longer sibling that also matches wins.
  return !siblings.some(
    (s) =>
      s !== item &&
      s.href.length > item.href.length &&
      under(trimSlash(s.href)),
  );
}

function trimSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
