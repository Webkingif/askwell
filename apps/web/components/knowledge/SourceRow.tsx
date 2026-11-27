"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KnowledgeSource } from "@askwell/shared";
import { Badge, Button, Spinner, cx } from "../ui";
import { knowledgeApi } from "./api";
import { FAILED_PDF_HINT } from "./files";
import { STATUS_LABELS, TYPE_LABELS, formatDate, isPending } from "./status";

/** One source: title (as text), type, status, date; delete after a confirm. */
export function SourceRow({ source }: { source: KnowledgeSource }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await knowledgeApi.remove(source.id);
    setPending(false);
    if (!result.ok) return setError(result.message);
    setConfirming(false);
    router.refresh();
  }

  const busy = isPending(source);
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-medium break-words text-fg">
            {source.title}
          </p>
          <p className="text-xs text-muted">
            {TYPE_LABELS[source.type]} · Added{" "}
            <time dateTime={source.createdAt}>
              {formatDate(source.createdAt)}
            </time>
          </p>
          {source.status === "failed" && (
            <p className="mt-1 text-xs text-danger">
              {source.type === "pdf"
                ? FAILED_PDF_HINT
                : "We couldn't read this one. Delete it and add it again, or try another file."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={source.status === "ready" ? "solid" : "outline"}
            className={cx(
              "gap-1.5",
              source.status === "failed" && "border-danger text-danger",
            )}
          >
            {busy && <Spinner size="sm" label={null} className="size-3" />}
            {STATUS_LABELS[source.status]}
          </Badge>
          {!confirming && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {confirming && (
        <div
          role="group"
          aria-label={`Delete ${source.title}`}
          className="glass flex flex-col gap-3 rounded-lg p-4"
        >
          <p className="text-sm text-fg">
            Delete <strong className="break-words">{source.title}</strong>? The
            bot stops using it. This can&apos;t be undone.
          </p>
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={onDelete} loading={pending}>
              Delete source
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
