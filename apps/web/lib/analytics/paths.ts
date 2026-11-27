// Which pages load PostHog (project.md §6.11). Pure, so it can be unit tested.

/** The widget panel. It runs inside customers' sites: their visitors are never tracked. */
export function isEmbedPath(pathname: string): boolean {
  return pathname === "/embed" || pathname.startsWith("/embed/");
}

/** Only the landing page and the dashboard start PostHog. */
export function isTrackedPath(pathname: string): boolean {
  if (isEmbedPath(pathname)) return false;
  return (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/")
  );
}
