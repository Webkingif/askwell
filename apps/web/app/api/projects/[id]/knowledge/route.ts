// POST /api/projects/:id/knowledge: paste text → process (project.md §6.4, §8).
// Owner route: same-origin only, so no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import {
  MAX_KNOWLEDGE_TEXT_LENGTH,
  MAX_KNOWLEDGE_TITLE_LENGTH,
  createTextKnowledgeRequestSchema,
  idParamsSchema,
  type CreateTextKnowledgeResponse,
} from "@askwell/shared";
import { createTextSource } from "../../../../../lib/knowledge-routes";
import { track } from "../../../../../lib/analytics/events";
import { processSource } from "../../../../../lib/knowledge/process";
import { errorResponse, toErrorResponse } from "../../../../../lib/projects";

/** Seconds: processing runs in after(), inside this budget (Vercel Hobby's maximum). */
export const maxDuration = 300;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/knowledge">,
) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to continue.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return errorResponse("invalid_request", "Not a valid project id.");
  }

  const json: unknown = await request.json().catch(() => undefined);
  const input = createTextKnowledgeRequestSchema.safeParse(json);
  if (!input.success) {
    return errorResponse(
      "invalid_request",
      `Give the text a title of 1 to ${MAX_KNOWLEDGE_TITLE_LENGTH} characters and 1 to ${MAX_KNOWLEDGE_TEXT_LENGTH} characters of text.`,
    );
  }

  try {
    const source = await createTextSource(params.data.id, input.data);
    // The pasted text isn't stored, so processSource gets it here.
    after(() => processSource(source.id, { text: input.data.text }));
    // IDs and the type only: no title, text or file name (project.md §9).
    track("knowledge_added", userId, {
      projectId: params.data.id,
      type: source.type,
    });
    const body: CreateTextKnowledgeResponse = { source };
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
