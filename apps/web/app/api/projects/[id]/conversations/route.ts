// GET /api/projects/:id/conversations: the Conversations list
// (project.md §6.7, §8). Owner route: same-origin only, so no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  idParamsSchema,
  type ListConversationsResponse,
} from "@askwell/shared";
import { listConversations } from "../../../../../lib/conversations";
import { errorResponse, toErrorResponse } from "../../../../../lib/projects";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[id]/conversations">,
) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to continue.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return errorResponse("invalid_request", "Not a valid project id.");
  }

  try {
    const body: ListConversationsResponse = {
      conversations: await listConversations(params.data.id),
    };
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}
