// POST /api/projects/:id/knowledge/finalize: check the uploaded file → process
// (project.md §6.4, §8, §9 File upload). Owner route: no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import {
  finalizeKnowledgeRequestSchema,
  idParamsSchema,
  type FinalizeKnowledgeResponse,
} from "@askwell/shared";
import { finalizeSource } from "../../../../../../lib/knowledge-routes";
import { processSource } from "../../../../../../lib/knowledge/process";
import { errorResponse, toErrorResponse } from "../../../../../../lib/projects";

/** Seconds: a 10 MB PDF is processed in after(), inside this budget (Vercel Hobby's maximum). */
export const maxDuration = 300;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/knowledge/finalize">,
) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to continue.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return errorResponse("invalid_request", "Not a valid project id.");
  }

  const json: unknown = await request.json().catch(() => undefined);
  const input = finalizeKnowledgeRequestSchema.safeParse(json);
  if (!input.success) {
    return errorResponse("invalid_request", "Not a valid source id.");
  }

  try {
    const source = await finalizeSource(params.data.id, input.data.sourceId);
    after(() => processSource(source.id));
    const body: FinalizeKnowledgeResponse = { source };
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}
