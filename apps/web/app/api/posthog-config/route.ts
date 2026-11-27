// GET /api/posthog-config (project.md §8 System). PostHog's public project key
// and host, read at request time so one build serves every environment. Public
// (lib/auth/routes.ts): the browser fetches it before it starts PostHog, on the
// landing page and dashboard only. Same origin only: no CORS headers.
import { NextResponse, connection } from "next/server";
import type { PostHogConfigResponse } from "@askwell/shared";
import { readPostHogSettings } from "../../../lib/analytics/env";

export async function GET() {
  // Read the env when the request runs, not at prerender.
  await connection();
  const settings = readPostHogSettings();
  const body: PostHogConfigResponse = settings ?? { key: null, host: null };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
