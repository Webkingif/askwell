import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { APP_NAME } from "@askwell/shared";
import { PageHeader } from "../../components/dashboard";
import { ProjectList } from "../../components/projects";
import { ErrorState, GlassPanel, LoadingState } from "../../components/ui";
import { DASHBOARD_PATH } from "../../lib/auth/routes";
import { listProjects } from "../../lib/projects";

// Absolute: the layout's title template only applies to child segments.
export const metadata: Metadata = { title: `Projects · ${APP_NAME}` };

/** Reads the owner's projects through the owner client (RLS scopes them). */
async function Projects() {
  // Owner data belongs to a real request, never a prerender: the owner
  // client reads the session (headers) as soon as it's created.
  await connection();
  let projects;
  try {
    projects = await listProjects();
  } catch (error) {
    console.error(error);
    return (
      <GlassPanel padding="lg">
        <ErrorState
          title="We couldn't load your projects"
          message="Something went wrong on our side. Try again in a moment."
          action={
            <a
              href={DASHBOARD_PATH}
              className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
            >
              Try again
            </a>
          }
        />
      </GlassPanel>
    );
  }
  return <ProjectList projects={projects} />;
}

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project is one chat widget for one website."
      />
      <Suspense
        fallback={
          <GlassPanel padding="lg">
            <LoadingState title="Loading your projects" />
          </GlassPanel>
        }
      >
        <Projects />
      </Suspense>
    </>
  );
}
