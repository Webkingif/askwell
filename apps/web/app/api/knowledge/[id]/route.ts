// DELETE /api/knowledge/:id: delete a source, its file and its chunks
// (project.md §6.4, §8). Owner route: no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { idParamsSchema, type OkResponse } from "@askwell/shared";
import { deleteSource } from "../../../../lib/knowledge-routes";
import { errorResponse, toErrorResponse } from "../../../../lib/projects";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/knowledge/[id]">,
) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to continue.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return errorResponse("invalid_request", "Not a valid source id.");
  }

  try {
    await deleteSource(params.data.id);
    const body: OkResponse = { ok: true };
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}
