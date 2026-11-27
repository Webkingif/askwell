import "server-only";
import {
  API_ERROR_STATUS,
  PLAN_LIMITS,
  apiError,
  type ApiErrorCode,
  type Project,
} from "@askwell/shared";
import type { Tables } from "@askwell/db";
import { NextResponse } from "next/server";
import { NotSignedInError, ensureAccount } from "./accounts";
import { track } from "./analytics/events";
import { createOwnerClient } from "./supabase/owner";
import { createServiceClient } from "./supabase/service";

// Projects for the signed-in owner (project.md §6.3, §8).
//
// - Reads, renames and deletes go through the owner client, so RLS scopes them
//   to the owner's own rows (§7: owners may SELECT, update `name`, DELETE).
//   A row RLS hides looks the same as a missing one: not_found.
// - Create needs the plan limit, so it calls the `create_project` function
//   with the service client (only service_role may execute it). The user ID
//   comes from Clerk's auth() and the plan from ensureAccount(), never input.

/** An expected failure, with the API error code the route returns. */
export class ProjectApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

const COLUMNS = "id, name, public_key, messages_used, period_start, created_at";

type ProjectRow = Pick<
  Tables<"projects">,
  "id" | "name" | "public_key" | "messages_used" | "period_start" | "created_at"
>;

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}

/** A Supabase error, as an Error that never carries ids or keys in its message. */
function dbError(what: string, error: { code?: string }): Error {
  return new Error(`projects: ${what} failed (${error.code || "no code"})`, {
    cause: error,
  });
}

const notFound = () => new ProjectApiError("not_found", "Project not found.");

/** The owner's projects, newest first. */
export async function listProjects(): Promise<Project[]> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw dbError("list", error);
  return data.map(toProject);
}

/**
 * The project if the signed-in owner owns it, else null. Read through the
 * owner client, so RLS decides. Call it before any service-client write on a
 * project (project.md §9 "Tenant leak").
 */
export async function getOwnedProject(id: string): Promise<Project | null> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError("read", error);
  return data ? toProject(data) : null;
}

/** Create a project under the owner's plan limit. `name` is already validated. */
export async function createProject(name: string): Promise<Project> {
  // Throws NotSignedInError with no session. Its user ID is Clerk's auth().
  const account = await ensureAccount();

  const { data, error } = await createServiceClient().rpc("create_project", {
    p_owner_id: account.clerk_user_id,
    p_name: name,
    p_max_projects: PLAN_LIMITS[account.plan].projects,
  });
  if (error) {
    if (error.message === "project_limit") {
      throw new ProjectApiError(
        "plan_limit_reached",
        account.plan === "free"
          ? "The Free plan includes 1 project. Upgrade to Pro for more."
          : "You've reached your plan's project limit.",
      );
    }
    throw dbError("create", error);
  }
  const project = toProject(data);
  track("project_created", account.clerk_user_id, {
    projectId: project.id,
    plan: account.plan,
  });
  return project;
}

/** Rename one of the owner's projects. `name` is already validated. */
export async function renameProject(
  id: string,
  name: string,
): Promise<Project> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .update({ name })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw dbError("rename", error);
  if (!data) throw notFound();
  return toProject(data);
}

/** Delete one of the owner's projects (its config, sources, chunks and conversations cascade). */
export async function deleteProject(id: string): Promise<void> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw dbError("delete", error);
  if (data.length === 0) throw notFound();
}

/** `{ error: { code, message } }` with the code's HTTP status. */
export function errorResponse(code: ApiErrorCode, message: string) {
  return NextResponse.json(apiError(code, message), {
    status: API_ERROR_STATUS[code],
  });
}

/** Map anything a projects route threw to an API error response. */
export function toErrorResponse(err: unknown) {
  if (err instanceof ProjectApiError)
    return errorResponse(err.code, err.message);
  if (err instanceof NotSignedInError) {
    return errorResponse("unauthorized", "Sign in to continue.");
  }
  console.error(err);
  return errorResponse("internal_error", "Something went wrong.");
}
