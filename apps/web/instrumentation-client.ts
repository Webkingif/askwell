// Runs in the browser before the app hydrates, on every page. It starts
// PostHog only on the landing page and the dashboard (lib/analytics/client.ts),
// so /embed never fetches the PostHog config or loads posthog-js.
import { startAnalytics } from "./lib/analytics/client";

void startAnalytics(window.location.pathname);

// A client-side move into the dashboard (from /sign-in, say) starts it too.
export function onRouterTransitionStart(url: string): void {
  void startAnalytics(new URL(url, window.location.href).pathname);
}
