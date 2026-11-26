// PATCH /api/projects/:id (rename), DELETE /api/projects/:id (project.md §6.3, §8).
// Owner routes: same-origin only, so no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  MAX_PROJECT_NAME_LENGTH,
  idParamsSchema,
  updateProjectRequestSchema,
  type OkResponse,
  type UpdateProjectResponse,
} from "@askwell/shared";
import {
  deleteProject,
  errorResponse,
  renameProject,
  toErrorResponse,
} from "../../../../lib/projects";

const signedOut = () => errorResponse("unauthorized", "Sign in to continue.");
const badId = () => errorResponse("invalid_request", "Not a valid project id.");

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]">,
) {
  const { userId } = await auth();
  if (!userId) return signedOut();

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return badId();

  const json: unknown = await request.json().catch(() => undefined);
  const input = updateProjectRequestSchema.safeParse(json);
  if (!input.success) {
    return errorResponse(
      "invalid_request",
      `Give the project a name of 1 to ${MAX_PROJECT_NAME_LENGTH} characters.`,
    );
  }

  try {
    const body: UpdateProjectResponse = {
      project: await renameProject(params.data.id, input.data.name),
    };
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/projects/[id]">,
) {
  const { userId } = await auth();
  if (!userId) return signedOut();

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return badId();

  try {
    await deleteProject(params.data.id);
    const body: OkResponse = { ok: true };
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}
