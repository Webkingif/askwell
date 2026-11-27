"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MAX_PROJECT_NAME_LENGTH, type Project } from "@askwell/shared";
import type { Usage } from "../../lib/usage";
import { projectPath, projectTabPath } from "../dashboard/nav";
import { usageText } from "../usage/format";
import { Button, Input } from "../ui";
import { projectsApi } from "./api";

type Mode = "view" | "rename" | "delete";

// UTC, so the server render and the browser agree.
const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatCreated(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/**
 * One project: open it, rename it, or delete it after typing its name.
 * `usage` (computed on the server) adds a "X / Y messages" line.
 */
export function ProjectRow({
  project,
  usage,
}: {
  project: Project;
  usage?: Usage;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState(project.name);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function show(next: Mode) {
    setMode(next);
    setError(null);
    setDraft(project.name);
    setConfirmText("");
  }

  async function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (draft.trim() === project.name) return show("view");
    setPending(true);
    const result = await projectsApi.rename(project.id, draft);
    setPending(false);
    if (!result.ok) return setError(result.message);
    show("view");
    router.refresh();
  }

  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || confirmText !== project.name) return;
    setPending(true);
    const result = await projectsApi.remove(project.id);
    setPending(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-6">
      {mode === "rename" ? (
        <form
          onSubmit={onRename}
          aria-label={`Rename ${project.name}`}
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
        >
          <Input
            label="New name"
            hideLabel
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            required
            autoFocus
            autoComplete="off"
            error={error ?? undefined}
            className="sm:flex-1"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="md"
              loading={pending}
              disabled={draft.trim() === ""}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => show("view")}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href={projectPath(project.id)}
              className="focus-ring rounded-sm text-base font-medium break-words text-fg hover:underline"
            >
              {project.name}
            </Link>
            <p className="text-xs text-muted">
              Created{" "}
              <time dateTime={project.createdAt}>
                {formatCreated(project.createdAt)}
              </time>
            </p>
            {usage && (
              <p className="text-xs text-muted">
                <Link
                  href={projectTabPath(project.id, "usage")}
                  className="focus-ring rounded-sm hover:underline"
                >
                  {usageText(usage.used, usage.limit)} this month
                </Link>
                {usage.atLimit && (
                  <span className="font-medium text-fg"> · Limit reached</span>
                )}
              </p>
            )}
          </div>
          {mode === "view" && (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => show("rename")}
              >
                Rename
              </Button>
              <Button variant="ghost" size="sm" onClick={() => show("delete")}>
                Delete
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "delete" && (
        <form
          onSubmit={onDelete}
          aria-label={`Delete ${project.name}`}
          className="glass flex flex-col gap-3 rounded-lg p-4"
        >
          <p className="text-sm text-fg">
            This deletes the project, its knowledge, widget settings and
            conversations. Type{" "}
            <strong className="break-all">{project.name}</strong> to confirm.
          </p>
          <Input
            label="Project name to confirm"
            hideLabel
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
            autoComplete="off"
            error={error ?? undefined}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              loading={pending}
              disabled={confirmText !== project.name}
            >
              Delete project
            </Button>
            <Button
              variant="ghost"
              onClick={() => show("view")}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
