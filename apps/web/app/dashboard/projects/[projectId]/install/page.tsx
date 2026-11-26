import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { idSchema } from "@askwell/shared";
import {
  InstallPanel,
  appOrigin,
  buildSnippet,
} from "../../../../../components/install";
import {
  ErrorState,
  GlassPanel,
  LoadingState,
} from "../../../../../components/ui";
import { DASHBOARD_PATH } from "../../../../../lib/auth/routes";
import { getOwnedProject } from "../../../../../lib/projects";

export const metadata: Metadata = { title: "Install" };

const backLink = (
  <a
    href={DASHBOARD_PATH}
    className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
  >
    Back to projects
  </a>
);

async function Install({
  params,
}: {
  params: PageProps<"/dashboard/projects/[projectId]/install">["params"];
}) {
  // Owner data belongs to a real request, never a prerender.
  await connection();
  const { projectId } = await params;

  let project = null;
  if (idSchema.safeParse(projectId).success) {
    try {
      // Owner client: RLS hides other owners' projects, so they read as null.
      project = await getOwnedProject(projectId);
    } catch (error) {
      console.error(error);
      return (
        <GlassPanel padding="lg">
          <ErrorState
            title="We couldn't load this project"
            message="Something went wrong on our side. Try again in a moment."
            action={backLink}
          />
        </GlassPanel>
      );
    }
  }

  if (!project) {
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

  const h = await headers();
  const origin = appOrigin(
    {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      VERCEL_URL: process.env.VERCEL_URL,
    },
    {
      host: h.get("x-forwarded-host") ?? h.get("host"),
      proto: h.get("x-forwarded-proto"),
    },
  );
  return <InstallPanel snippet={buildSnippet(origin, project.publicKey)} />;
}

export default function InstallPage({
  params,
}: PageProps<"/dashboard/projects/[projectId]/install">) {
  return (
    <Suspense
      fallback={
        <GlassPanel padding="lg">
          <LoadingState title="Loading your install code" />
        </GlassPanel>
      }
    >
      <Install params={params} />
    </Suspense>
  );
}
