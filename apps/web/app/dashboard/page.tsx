import type { Metadata } from "next";
import { PageHeader } from "../../components/dashboard";
import { Button, EmptyState, GlassPanel } from "../../components/ui";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  const newProject = (
    <Button disabled title="Coming soon">
      New project
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project is one chat widget for one website."
        action={newProject}
      />
      <GlassPanel padding="lg">
        <EmptyState
          title="Create your first project"
          message="A project holds your info, your widget settings and your conversations. Creating projects is coming soon."
          action={newProject}
        />
      </GlassPanel>
    </>
  );
}
