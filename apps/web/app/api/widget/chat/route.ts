// POST /api/widget/chat (project.md §6.6, §8 Public). Called by the widget
// panel; CORS allows every origin, with no credentials (the route reads no
// cookies; the public key and visitor id are in the body).
import { NextResponse } from "next/server";
import { handleChat } from "../../../../lib/chat/handle-chat";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export async function POST(request: Request) {
  const { status, body } = await handleChat(request);
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
