import { redirect } from "next/navigation";
import { DASHBOARD_PATH } from "../../../lib/auth/routes";

/** The projects list lives at /dashboard. */
export default function ProjectsIndex() {
  redirect(DASHBOARD_PATH);
}
