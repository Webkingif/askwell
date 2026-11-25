import { Suspense } from "react";
import { PageHeader, ProjectTabs } from "../../../../components/dashboard";

async function ProjectHeader({
  params,
}: {
  params: LayoutProps<"/dashboard/projects/[projectId]">["params"];
}) {
  const { projectId } = await params;
  return (
    <>
      {/* The project's name arrives with Phase 2's data. */}
      <PageHeader title="Project" description={projectId} />
      <ProjectTabs projectId={projectId} />
    </>
  );
}

export default function ProjectLayout({
  children,
  params,
}: LayoutProps<"/dashboard/projects/[projectId]">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Suspense fallback={<PageHeader title="Project" />}>
          <ProjectHeader params={params} />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
