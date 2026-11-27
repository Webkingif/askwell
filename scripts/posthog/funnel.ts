// Creates or updates the "Askwell core funnel" insight in PostHog
// (project.md §6.11): landing → sign up → project → knowledge → install →
// first chat → upgrade. Safe to re-run: it updates the insight with this
// name instead of adding another, so the same command works against prod.
//
//   POSTHOG_PERSONAL_API_KEY=… node scripts/posthog/funnel.ts
//
// Env: POSTHOG_PERSONAL_API_KEY (insight scope; never commit or print it),
// POSTHOG_API_HOST (default https://us.posthog.com), POSTHOG_PROJECT_ID
// (default: the key's current project). Prints the insight's URL.

export const FUNNEL_NAME = "Askwell core funnel";

/** The funnel's steps, in order: [event, label]. */
export const FUNNEL_STEPS = [
  ["$pageview", "Landing page"],
  ["signed_up", "Signed up"],
  ["project_created", "Created a project"],
  ["knowledge_added", "Added knowledge"],
  ["snippet_copied", "Copied the install snippet"],
  ["first_chat", "First widget chat"],
  ["upgraded", "Upgraded"],
] as const;

/** The insight's query: a 14-day-window funnel over the last 90 days. */
export function funnelQuery() {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: FUNNEL_STEPS.map(([event, name]) => ({
        kind: "EventsNode",
        event,
        name: event,
        custom_name: name,
        // Step 1 is the landing page only, not any pageview.
        ...(event === "$pageview"
          ? {
              properties: [
                {
                  key: "$pathname",
                  value: "/",
                  operator: "exact",
                  type: "event",
                },
              ],
            }
          : {}),
      })),
      dateRange: { date_from: "-90d" },
      funnelsFilter: {
        funnelVizType: "steps",
        funnelOrderType: "ordered",
        funnelWindowInterval: 14,
        funnelWindowIntervalUnit: "day",
      },
    },
  };
}

type Insight = { id: number; short_id: string; name: string | null };

async function api<T>(
  host: string,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // The sandbox proxy drops some connections: retry network errors and 5xx.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${host}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      });
      if (res.status >= 500 && attempt < 6)
        throw new Error(`HTTP ${res.status}`);
      if (!res.ok) {
        throw new Error(
          `${init.method ?? "GET"} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
          { cause: "final" },
        );
      }
      return (await res.json()) as T;
    } catch (error) {
      if ((error as Error).cause === "final" || attempt >= 6) throw error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

export async function upsertFunnel(
  env: Record<string, string | undefined> = process.env,
) {
  const key = env.POSTHOG_PERSONAL_API_KEY;
  if (!key) throw new Error("Set POSTHOG_PERSONAL_API_KEY.");
  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(
    /\/+$/,
    "",
  );
  const project =
    env.POSTHOG_PROJECT_ID ??
    String(
      (await api<{ id: number }>(host, key, "/api/projects/@current/")).id,
    );
  const base = `/api/projects/${project}/insights/`;

  const found = await api<{ results: Insight[] }>(
    host,
    key,
    `${base}?search=${encodeURIComponent(FUNNEL_NAME)}&limit=100`,
  );
  const existing = found.results.find((i) => i.name === FUNNEL_NAME);
  const body = JSON.stringify({
    name: FUNNEL_NAME,
    description:
      "project.md §6.11: landing → sign up → project → knowledge → install → first chat → upgrade. Managed by scripts/posthog/funnel.ts.",
    query: funnelQuery(),
  });
  const insight = existing
    ? await api<Insight>(host, key, `${base}${existing.id}/`, {
        method: "PATCH",
        body,
      })
    : await api<Insight>(host, key, base, { method: "POST", body });
  const url = `${host}/project/${project}/insights/${insight.short_id}`;
  return { url, created: !existing, id: insight.id, shortId: insight.short_id };
}

if (import.meta.main) {
  const { url, created } = await upsertFunnel();
  console.log(`${created ? "Created" : "Updated"} "${FUNNEL_NAME}": ${url}`);
}
