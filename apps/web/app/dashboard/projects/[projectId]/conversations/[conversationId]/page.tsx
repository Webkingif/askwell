import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { idSchema } from "@askwell/shared";
import { Thread } from "../../../../../../components/conversations";
import { getThread } from "../../../../../../lib/conversations";
import { ProjectApiError } from "../../../../../../lib/projects";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: PageProps<"/dashboard/projects/[projectId]/conversations/[conversationId]">) {
  // Owner data belongs to a real request, never a prerender.
  await connection();
  const { projectId, conversationId } = await params;
  if (
    !idSchema.safeParse(projectId).success ||
    !idSchema.safeParse(conversationId).success
  ) {
    notFound();
  }

  let thread;
  try {
    // Owner client: RLS hides other owners' conversations (not_found).
    thread = await getThread(conversationId);
  } catch (error) {
    if (error instanceof ProjectApiError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
  // A conversation of another of the owner's projects isn't under this URL.
  if (thread.conversation.projectId !== projectId) notFound();

  return <Thread projectId={projectId} thread={thread} />;
}
