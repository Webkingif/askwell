// GET /api/conversations/:id: one conversation's full thread
// (project.md §6.7, §8). Owner route: same-origin only, so no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  idParamsSchema,
  type ConversationThreadResponse,
} from "@askwell/shared";
import { getThread } from "../../../../lib/conversations";
import { errorResponse, toErrorResponse } from "../../../../lib/projects";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/conversations/[id]">,
) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to continue.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return errorResponse("invalid_request", "Not a valid conversation id.");
  }

  try {
    const body: ConversationThreadResponse = await getThread(params.data.id);
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}
