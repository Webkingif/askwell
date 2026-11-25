import { redirect } from "next/navigation";
import {
  DEFAULT_PROJECT_TAB,
  projectTabPath,
} from "../../../../components/dashboard";

/** A project opens on its Knowledge tab. */
export default async function ProjectIndex({
  params,
}: PageProps<"/dashboard/projects/[projectId]">) {
  const { projectId } = await params;
  redirect(projectTabPath(projectId, DEFAULT_PROJECT_TAB));
}
