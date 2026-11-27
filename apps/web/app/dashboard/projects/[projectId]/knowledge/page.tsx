import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PLAN_LIMITS, idSchema } from "@askwell/shared";
import { KnowledgePanel } from "../../../../../components/knowledge";
import {
  ErrorState,
  GlassPanel,
  LoadingState,
} from "../../../../../components/ui";
import { ensureAccount } from "../../../../../lib/accounts";
import { DASHBOARD_PATH } from "../../../../../lib/auth/routes";
import { getOwnedProject } from "../../../../../lib/projects";
import { listSources } from "./sources";

export const metadata: Metadata = { title: "Knowledge" };

const backLink = (
  <a
    href={DASHBOARD_PATH}
    className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
  >
    Back to projects
  </a>
);

async function Knowledge({
  params,
}: {
  params: PageProps<"/dashboard/projects/[projectId]/knowledge">["params"];
}) {
  // Owner data belongs to a real request, never a prerender.
  await connection();
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) return <NotFound />;

  let data;
  try {
    // Owner client: RLS hides other owners' projects, so they read as null.
    const project = await getOwnedProject(projectId);
    if (project) {
      // The plan is read on the server, never from the client (project.md §9).
      const [account, sources] = await Promise.all([
        ensureAccount(),
        listSources(projectId),
      ]);
      data = { sources, plan: account.plan };
    }
  } catch (error) {
    console.error(error);
    return (
      <GlassPanel padding="lg">
        <ErrorState
          title="We couldn't load your knowledge"
          message="Something went wrong on our side. Try again in a moment."
          action={backLink}
        />
      </GlassPanel>
    );
  }

  if (!data) return <NotFound />;
  return (
    <KnowledgePanel
      projectId={projectId}
      sources={data.sources}
      plan={data.plan}
      limit={PLAN_LIMITS[data.plan].knowledgeSources}
    />
  );
}

function NotFound() {
  return (
    <GlassPanel padding="lg">
      <ErrorState
        title="Project not found"
        message="It may have been deleted, or it belongs to another account."
        action={backLink}
      />
    </GlassPanel>
  );
}

export default function KnowledgePage({
  params,
}: PageProps<"/dashboard/projects/[projectId]/knowledge">) {
  return (
    <Suspense
      fallback={
        <GlassPanel padding="lg">
          <LoadingState title="Loading your knowledge" />
        </GlassPanel>
      }
    >
      <Knowledge params={params} />
    </Suspense>
  );
}
