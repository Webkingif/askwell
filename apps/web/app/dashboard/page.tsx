import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { PageHeader } from "../../components/dashboard";
import { Button, EmptyState, GlassPanel } from "../../components/ui";

// Absolute: the layout's title template only applies to child segments.
export const metadata: Metadata = { title: `Projects · ${APP_NAME}` };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project is one chat widget for one website."
      />
      <GlassPanel padding="lg">
        <EmptyState
          title="Create your first project"
          message="A project holds your info, your widget settings and your conversations. Creating projects is coming soon."
          action={
            <Button disabled title="Coming soon">
              New project
            </Button>
          }
        />
      </GlassPanel>
    </>
  );
}
