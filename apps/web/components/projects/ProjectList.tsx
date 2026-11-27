import type { Plan, Project } from "@askwell/shared";
import { currentUsage } from "../../lib/usage";
import { EmptyState, GlassPanel } from "../ui";
import { CreateProjectForm } from "./CreateProjectForm";
import { ProjectRow } from "./ProjectRow";

/**
 * The owner's projects (already loaded on the server), with the create form.
 * With `plan` (read on the server), each row shows this month's messages.
 */
export function ProjectList({
  projects,
  plan,
  now = new Date(),
}: {
  projects: Project[];
  plan?: Plan;
  now?: Date;
}) {
  if (projects.length === 0) {
    return (
      <GlassPanel padding="lg" className="flex flex-col items-center">
        <EmptyState
          title="Create your first project"
          message="A project is one chat widget for one website. It holds your info, your widget settings and your conversations."
        />
        <div className="w-full max-w-md">
          <CreateProjectForm />
        </div>
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel padding="md">
        <CreateProjectForm />
      </GlassPanel>
      <GlassPanel padding="none">
        <ul aria-label="Your projects" className="divide-y divide-line">
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              usage={plan ? currentUsage(p, plan, now) : undefined}
            />
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}
