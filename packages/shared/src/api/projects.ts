// Owner routes: projects CRUD (project.md §6.3, §8).
import { z } from "zod";
import { MAX_PROJECT_NAME_LENGTH } from "../constants";
import type { IsoDateString } from "./common";

export interface Project {
  id: string;
  name: string;
  publicKey: string;
  /** Accepted messages in the current period. */
  messagesUsed: number;
  periodStart: IsoDateString;
  createdAt: IsoDateString;
}

const projectNameSchema = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH);

/** GET /api/projects: no input. */
export interface ListProjectsResponse {
  projects: Project[];
}

/** POST /api/projects */
export const createProjectRequestSchema = z.object({ name: projectNameSchema });
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export interface CreateProjectResponse {
  project: Project;
}

/** PATCH /api/projects/:id (rename only). Params: `idParamsSchema`. */
export const updateProjectRequestSchema = z.object({ name: projectNameSchema });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export interface UpdateProjectResponse {
  project: Project;
}

/** DELETE /api/projects/:id. Params: `idParamsSchema`. Returns `OkResponse`. */
