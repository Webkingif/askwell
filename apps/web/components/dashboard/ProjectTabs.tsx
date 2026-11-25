import { Suspense } from "react";
import { NavLinks, NavLinksView } from "./NavLinks";
import { projectTabs } from "./nav";

/** The five project tabs, each a link to its own route. */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const nav = {
    items: projectTabs(projectId),
    variant: "tabs",
    label: "Project",
    className: "border-b border-line",
  } as const;
  return (
    <Suspense fallback={<NavLinksView {...nav} pathname={null} />}>
      <NavLinks {...nav} />
    </Suspense>
  );
}
