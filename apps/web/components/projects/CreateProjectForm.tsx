"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MAX_PROJECT_NAME_LENGTH } from "@askwell/shared";
import { BILLING_PATH } from "../dashboard/nav";
import { Button, Input } from "../ui";
import { projectsApi } from "./api";

type Problem =
  { kind: "upgrade"; message: string } | { kind: "error"; message: string };

/** Name a new project. The server applies the plan limit; on 402 we show its message and a way to upgrade. */
export function CreateProjectForm({
  autoFocus = false,
}: {
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setProblem(null);
    const result = await projectsApi.create(name);
    setPending(false);
    if (result.ok) {
      setName("");
      router.refresh();
      return;
    }
    setProblem(
      result.code === "plan_limit_reached"
        ? { kind: "upgrade", message: result.message }
        : { kind: "error", message: result.message },
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <form
        onSubmit={onSubmit}
        aria-label="New project"
        className="flex w-full flex-col gap-2 sm:flex-row sm:items-start"
      >
        <Input
          label="Project name"
          hideLabel
          name="name"
          placeholder="e.g. My website"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          required
          autoFocus={autoFocus}
          autoComplete="off"
          error={problem?.kind === "error" ? problem.message : undefined}
          className="sm:flex-1"
        />
        <Button
          type="submit"
          loading={pending}
          disabled={name.trim() === ""}
          className="w-full sm:w-auto"
        >
          Create project
        </Button>
      </form>
      {problem?.kind === "upgrade" && (
        <div
          role="alert"
          className="glass flex flex-col gap-3 rounded-lg p-4 text-left sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-fg">{problem.message}</p>
          <Link
            href={BILLING_PATH}
            className="focus-ring inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}
    </div>
  );
}
