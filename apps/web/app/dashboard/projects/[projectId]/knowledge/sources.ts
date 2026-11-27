import "server-only";
import type { KnowledgeSource } from "@askwell/shared";
import { toKnowledgeSource } from "../../../../../lib/knowledge-routes";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

/**
 * The project's sources, newest first, through the owner client: RLS scopes
 * them to the signed-in owner's projects. Call after getOwnedProject.
 */
export async function listSources(
  projectId: string,
): Promise<KnowledgeSource[]> {
  const { data, error } = await createOwnerClient()
    .from("knowledge_sources")
    .select("id, project_id, title, type, status, storage_key, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`knowledge: list failed (${error.code || "no code"})`, {
      cause: error,
    });
  }
  return data.map(toKnowledgeSource);
}
