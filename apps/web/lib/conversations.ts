import "server-only";
import {
  messageRoleSchema,
  type ConversationSummary,
  type ConversationThreadResponse,
  type Message,
} from "@askwell/shared";
import type { Database, Tables } from "@askwell/db";
import { ProjectApiError, getOwnedProject } from "./projects";
import { createOwnerClient } from "./supabase/owner";

// Conversations for the signed-in owner (project.md §6.7, §8, §9).
//
// Every read goes through the owner client, so RLS is the boundary: a project
// or conversation another owner holds looks the same as a missing one
// (not_found). Never the service client here.

/** The Conversations list's page size (list_conversations clamps to 1..50). */
export const CONVERSATIONS_LIMIT = 50;

type SummaryRow =
  Database["public"]["Functions"]["list_conversations"]["Returns"][number];

type ConversationRow = Pick<
  Tables<"conversations">,
  "id" | "project_id" | "visitor_id" | "created_at"
>;

type MessageRow = Pick<Tables<"messages">, "id" | "role" | "body" | "created_at">;

/** A Supabase error, as an Error that never carries ids or keys in its message. */
function dbError(what: string, error: { code?: string }): Error {
  return new Error(`conversations: ${what} failed (${error.code || "no code"})`, {
    cause: error,
  });
}

export function toConversationSummary(row: SummaryRow): ConversationSummary {
  return {
    id: row.id,
    visitorId: row.visitor_id,
    preview: row.preview,
    messageCount: row.message_count,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

export function toMessage(row: MessageRow): Message {
  const role = messageRoleSchema.safeParse(row.role);
  // The table's check constraint allows only these; anything else is a bug.
  if (!role.success) throw new Error("conversations: unknown message role");
  return {
    id: row.id,
    role: role.data,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * The project's conversations, newest first by last message, at most
 * CONVERSATIONS_LIMIT. not_found if the owner can't see the project, so an
 * unknown project is a 404 and not an empty list.
 */
export async function listConversations(
  projectId: string,
): Promise<ConversationSummary[]> {
  if (!(await getOwnedProject(projectId))) {
    throw new ProjectApiError("not_found", "Project not found.");
  }
  const { data, error } = await createOwnerClient().rpc("list_conversations", {
    p_project_id: projectId,
    p_limit: CONVERSATIONS_LIMIT,
  });
  if (error) throw dbError("list", error);
  return data.map(toConversationSummary);
}

/** One conversation and its messages, oldest first. not_found if RLS hides it. */
export async function getThread(
  conversationId: string,
): Promise<ConversationThreadResponse> {
  const db = createOwnerClient();

  const conversation = await db
    .from("conversations")
    .select("id, project_id, visitor_id, created_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversation.error) throw dbError("read", conversation.error);
  if (!conversation.data) {
    throw new ProjectApiError("not_found", "Conversation not found.");
  }
  const c: ConversationRow = conversation.data;

  const messages = await db
    .from("messages")
    .select("id, role, body, created_at")
    .eq("conversation_id", c.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (messages.error) throw dbError("read messages", messages.error);

  return {
    conversation: {
      id: c.id,
      projectId: c.project_id,
      visitorId: c.visitor_id,
      createdAt: c.created_at,
    },
    messages: messages.data.map(toMessage),
  };
}
