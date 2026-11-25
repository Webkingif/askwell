"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";
import { isNavActive, type NavItem } from "./nav";

export type NavLinksVariant = "sidebar" | "tabs";

export interface NavLinksProps {
  items: readonly NavItem[];
  variant: NavLinksVariant;
  /** Screen-reader name for the nav landmark. */
  label: string;
  className?: string;
}

const listClass: Record<NavLinksVariant, string> = {
  // Row on mobile (top bar), column from md up (sidebar).
  sidebar: "flex items-center gap-1 md:flex-col md:items-stretch",
  // One row; scrolls inside itself on narrow screens, never the page.
  // The fade below sm hints that more tabs sit off to the right.
  tabs:
    "-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] " +
    "[mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none]",
};

const linkBase =
  "focus-ring rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-150";

const linkClass: Record<
  NavLinksVariant,
  { base: string; on: string; off: string }
> = {
  sidebar: {
    base: "block px-3 py-2",
    on: "bg-accent text-accent-fg",
    off: "text-muted hover:bg-subtle hover:text-fg",
  },
  tabs: {
    base: "block rounded-b-none border-b-2 px-3 py-2.5",
    on: "border-fg text-fg",
    off: "border-transparent text-muted hover:text-fg",
  },
};

/** Static links with an active state from the current path. */
export function NavLinksView({
  items,
  variant,
  label,
  className,
  pathname,
}: NavLinksProps & { pathname: string | null }) {
  const styles = linkClass[variant];
  return (
    <nav aria-label={label} className={className}>
      <ul className={listClass[variant]}>
        {items.map((item) => {
          const active =
            pathname !== null && isNavActive(pathname, item, items);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  linkBase,
                  styles.base,
                  active ? styles.on : styles.off,
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Nav links that read the current path. Render inside <Suspense> with
 * `<NavLinksView pathname={null} …/>` as the fallback: cacheComponents
 * needs usePathname() under a Suspense boundary.
 */
export function NavLinks(props: NavLinksProps) {
  const pathname = usePathname();
  return <NavLinksView {...props} pathname={pathname} />;
}
