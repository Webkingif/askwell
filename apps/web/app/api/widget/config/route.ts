// GET /api/widget/config?key=pk_... (project.md §6.5, §8 Public).
// Called by the loader from any website: CORS allows every origin, with no
// credentials (the route reads no cookies and grants nothing but the config).
//
// TODO(Phase 3): rate limit with Arcjet (project.md §9 Cost abuse) once
// ARCJET_KEY is available.
import { NextResponse, type NextRequest } from "next/server";
import {
  API_ERROR_STATUS,
  apiError,
  widgetConfigQuerySchema,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { getWidgetConfigByKey } from "../../../../lib/widget-config";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

// A malformed key and an unknown one get the same answer.
function notFound() {
  return NextResponse.json(apiError("not_found", "Unknown widget key."), {
    status: API_ERROR_STATUS.not_found,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const query = widgetConfigQuerySchema.safeParse({
    key: request.nextUrl.searchParams.get("key") ?? "",
  });
  if (!query.success) return notFound();

  try {
    const config = await getWidgetConfigByKey(query.data.key);
    if (!config) return notFound();
    const body: WidgetConfigResponse = { config };
    return NextResponse.json(body, {
      headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      apiError("internal_error", "Something went wrong."),
      {
        status: API_ERROR_STATUS.internal_error,
        headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
      },
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
