// GET /api/projects, POST /api/projects (project.md §6.3, §8).
// Owner routes: same-origin only, so no CORS headers.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  MAX_PROJECT_NAME_LENGTH,
  createProjectRequestSchema,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@askwell/shared";
import {
  createProject,
  errorResponse,
  listProjects,
  toErrorResponse,
} from "../../../lib/projects";

const signedOut = () => errorResponse("unauthorized", "Sign in to continue.");

export async function GET() {
  const { userId } = await auth();
  if (!userId) return signedOut();
  try {
    const body: ListProjectsResponse = { projects: await listProjects() };
    return NextResponse.json(body);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return signedOut();

  const json: unknown = await request.json().catch(() => undefined);
  const input = createProjectRequestSchema.safeParse(json);
  if (!input.success) {
    return errorResponse(
      "invalid_request",
      `Give the project a name of 1 to ${MAX_PROJECT_NAME_LENGTH} characters.`,
    );
  }

  try {
    const body: CreateProjectResponse = {
      project: await createProject(input.data.name),
    };
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
