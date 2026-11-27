import type { Metadata } from "next";
import { connection } from "next/server";
import { idSchema } from "@askwell/shared";
import { ConversationList } from "../../../../../components/conversations";
import { ErrorState, GlassPanel } from "../../../../../components/ui";
import { DASHBOARD_PATH } from "../../../../../lib/auth/routes";
import {
  CONVERSATIONS_LIMIT,
  listConversations,
} from "../../../../../lib/conversations";
import { ProjectApiError } from "../../../../../lib/projects";

export const metadata: Metadata = { title: "Conversations" };

// loading.tsx and error.tsx next to this page cover the loading and
// unexpected-error states.
export default async function ConversationsPage({
  params,
}: PageProps<"/dashboard/projects/[projectId]/conversations">) {
  // Owner data belongs to a real request, never a prerender.
  await connection();
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) return <ProjectNotFound />;

  let conversations;
  try {
    // Owner client: RLS hides other owners' projects (not_found).
    conversations = await listConversations(projectId);
  } catch (error) {
    if (error instanceof ProjectApiError && error.code === "not_found") {
      return <ProjectNotFound />;
    }
    throw error;
  }

  return (
    <ConversationList
      projectId={projectId}
      conversations={conversations}
      limit={CONVERSATIONS_LIMIT}
      now={new Date()}
    />
  );
}

function ProjectNotFound() {
  return (
    <GlassPanel padding="lg">
      <ErrorState
        title="Project not found"
        message="It may have been deleted, or it belongs to another account."
        action={
          <a
            href={DASHBOARD_PATH}
            className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
          >
            Back to projects
          </a>
        }
      />
    </GlassPanel>
  );
}
