import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { idSchema } from "@askwell/shared";
import {
  ErrorState,
  GlassPanel,
  LoadingState,
} from "../../../../../components/ui";
import { UsagePanel } from "../../../../../components/usage";
import { ensureAccount } from "../../../../../lib/accounts";
import { DASHBOARD_PATH } from "../../../../../lib/auth/routes";
import { getOwnedProject } from "../../../../../lib/projects";
import { currentUsage } from "../../../../../lib/usage";

export const metadata: Metadata = { title: "Usage" };

const backLink = (
  <a
    href={DASHBOARD_PATH}
    className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
  >
    Back to projects
  </a>
);

async function Usage({
  params,
}: {
  params: PageProps<"/dashboard/projects/[projectId]/usage">["params"];
}) {
  // Owner data belongs to a real request, never a prerender.
  await connection();
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) return <NotFound />;

  let data;
  try {
    // Owner client: RLS hides other owners' projects, so they read as null.
    // The plan is read on the server, never from the client (project.md §9).
    const [project, account] = await Promise.all([
      getOwnedProject(projectId),
      ensureAccount(),
    ]);
    if (project) {
      data = {
        usage: currentUsage(project, account.plan, new Date()),
        plan: account.plan,
      };
    }
  } catch (error) {
    console.error(error);
    return (
      <GlassPanel padding="lg">
        <ErrorState
          title="We couldn't load your usage"
          message="Something went wrong on our side. Try again in a moment."
          action={backLink}
        />
      </GlassPanel>
    );
  }

  if (!data) return <NotFound />;
  return (
    <UsagePanel projectId={projectId} usage={data.usage} plan={data.plan} />
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

export default function UsagePage({
  params,
}: PageProps<"/dashboard/projects/[projectId]/usage">) {
  return (
    <Suspense
      fallback={
        <GlassPanel padding="lg">
          <LoadingState title="Loading your usage" />
        </GlassPanel>
      }
    >
      <Usage params={params} />
    </Suspense>
  );
}
