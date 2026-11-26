// Client calls to the projects API (PPW-T03). The server decides every
// limit; these helpers only pass on what it says.
import {
  apiErrorSchema,
  type ApiErrorCode,
  type CreateProjectResponse,
  type UpdateProjectResponse,
} from "@askwell/shared";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ApiErrorCode | "network_error"; message: string };

const NETWORK_ERROR = {
  ok: false,
  code: "network_error",
  message: "We couldn't reach the server. Check your connection and try again.",
} as const;

const FALLBACK_MESSAGE = "Something went wrong. Try again.";

async function call<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method,
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return NETWORK_ERROR;
  }

  const json: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, data: json as T };

  const parsed = apiErrorSchema.safeParse(json);
  return parsed.success
    ? { ok: false, ...parsed.data.error }
    : { ok: false, code: "internal_error", message: FALLBACK_MESSAGE };
}

const projectUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export const projectsApi = {
  create: (name: string) =>
    call<CreateProjectResponse>("/api/projects", {
      method: "POST",
      body: { name },
    }),
  rename: (id: string, name: string) =>
    call<UpdateProjectResponse>(projectUrl(id), {
      method: "PATCH",
      body: { name },
    }),
  remove: (id: string) =>
    call<{ ok: true }>(projectUrl(id), { method: "DELETE" }),
};
