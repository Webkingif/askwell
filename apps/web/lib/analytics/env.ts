// PostHog's public project key and host (project.md §11). Both are public by
// design, but they are read at request time (GET /api/posthog-config, the
// server client), never inlined at build, so one build works in every
// environment.

export const POSTHOG_KEY_VAR = "NEXT_PUBLIC_POSTHOG_KEY";
export const POSTHOG_HOST_VAR = "NEXT_PUBLIC_POSTHOG_HOST";

export type PostHogSettings = { key: string; host: string };

/**
 * The key and host, or null when either is unset or blank, so local runs and
 * tests without PostHog are a no-op instead of an error.
 */
export function readPostHogSettings(
  env: Record<string, string | undefined> = process.env,
): PostHogSettings | null {
  // Looked up by a variable name: Next.js inlines `process.env.NEXT_PUBLIC_*`
  // at build time, and these must be read when the request runs.
  const key = env[POSTHOG_KEY_VAR]?.trim();
  const host = env[POSTHOG_HOST_VAR]?.trim().replace(/\/+$/, "");
  if (!key || !host) return null;
  // The project key (phc_…) is public; a personal API key (phx_…) is not.
  if (key.startsWith("phx_")) return null;
  return { key, host };
}
