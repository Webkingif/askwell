import { Suspense } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import { DASHBOARD_PATH } from "../../lib/auth/routes";
import { GlassPanel } from "../ui";
import { NavLinks, NavLinksView } from "./NavLinks";
import { SIDEBAR_LINKS } from "./nav";

/**
 * Dashboard navigation. A glass sidebar from md (768 px) up; below that,
 * a glass top bar with the same links and the user menu.
 * Sign-out goes to /sign-in (afterSignOutUrl on ClerkProvider).
 */
export function Sidebar() {
  const nav = {
    items: SIDEBAR_LINKS,
    variant: "sidebar",
    label: "Dashboard",
  } as const;
  return (
    <GlassPanel
      as="header"
      padding="none"
      strong
      className={
        "sticky top-0 z-20 flex items-center gap-2 rounded-none border-x-0 border-t-0 px-4 py-2 " +
        "md:top-4 md:m-4 md:h-[calc(100dvh-2rem)] md:w-56 md:shrink-0 md:flex-col md:items-stretch " +
        "md:gap-6 md:rounded-xl md:border md:p-4"
      }
    >
      <Link
        href={DASHBOARD_PATH}
        className="focus-ring mr-auto rounded-md px-1 text-base font-semibold tracking-tight md:mr-0 md:px-3 md:pt-1"
      >
        {APP_NAME}
      </Link>
      <Suspense fallback={<NavLinksView {...nav} pathname={null} />}>
        <NavLinks {...nav} />
      </Suspense>
      <div className="flex shrink-0 items-center md:mt-auto md:px-3">
        <UserButton />
      </div>
    </GlassPanel>
  );
}
