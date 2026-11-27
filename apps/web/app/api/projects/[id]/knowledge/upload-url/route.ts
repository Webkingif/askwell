// POST /api/projects/:id/knowledge/upload-url: reserve a file source → signed
// upload URL (project.md §6.4, §8). Owner route: no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  idParamsSchema,
  knowledgeUploadUrlRequestSchema,
  type KnowledgeUploadUrlResponse,
} from "@askwell/shared";
import { createUploadSource } from "../../../../../../lib/knowledge-routes";
import { errorResponse, toErrorResponse } from "../../../../../../lib/projects";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/knowledge/upload-url">,
) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to continue.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return errorResponse("invalid_request", "Not a valid project id.");
  }

  const json: unknown = await request.json().catch(() => undefined);
  const input = knowledgeUploadUrlRequestSchema.safeParse(json);
  if (!input.success) {
    const issue = input.error.issues[0];
    const field = issue?.path[0];
    if (field === "sizeBytes" && issue?.code === "too_big") {
      return errorResponse(
        "file_too_large",
        `Files can be at most ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)} MB.`,
      );
    }
    if (field === "fileName" || field === "contentType") {
      return errorResponse(
        "unsupported_file_type",
        "Only PDF, Markdown and TXT files are allowed.",
      );
    }
    return errorResponse("invalid_request", "Check the title and the file.");
  }

  try {
    const body: KnowledgeUploadUrlResponse = await createUploadSource(
      params.data.id,
      input.data,
    );
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
