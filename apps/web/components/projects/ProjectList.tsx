import type { Project } from "@askwell/shared";
import { EmptyState, GlassPanel } from "../ui";
import { CreateProjectForm } from "./CreateProjectForm";
import { ProjectRow } from "./ProjectRow";

/** The owner's projects (already loaded on the server), with the create form. */
export function ProjectList({ projects }: { projects: Project[] }) {
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
            <ProjectRow key={p.id} project={p} />
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}
