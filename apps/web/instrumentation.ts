import type { Instrumentation } from "next";

// Server error tracking (project.md §6.11): every uncaught error in a route
// handler, server component or server action goes to PostHog. Node runtime
// only (posthog-node); a no-op without NEXT_PUBLIC_POSTHOG_KEY/HOST.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureRequestError } = await import("./lib/analytics/server");
  await captureRequestError(error, request, context);
};
