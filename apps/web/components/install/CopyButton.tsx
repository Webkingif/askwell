"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trackClient } from "../../lib/analytics/client";
import { Button } from "../ui";

type Status = "idle" | "copied" | "manual";

/**
 * Copies `text`. If the Clipboard API is missing or refused, it selects the
 * snippet (the element with `targetId`) so the user can press Ctrl/⌘+C.
 * Either way it sends `snippet_copied` with the project ID from the URL
 * (/dashboard/projects/[projectId]/install), never the snippet or its key.
 */
export function CopyButton({
  text,
  targetId,
}: {
  text: string;
  targetId: string;
}) {
  // Null outside the app router (a test, say): then nothing is sent.
  const params = useParams<{ projectId?: string }>() as {
    projectId?: string;
  } | null;
  const projectId = params?.projectId;
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function selectSnippet() {
    const target = document.getElementById(targetId);
    const selection = window.getSelection();
    if (!target || !selection) return;
    selection.removeAllRanges();
    selection.selectAllChildren(target);
  }

  async function onCopy() {
    clearTimeout(timer.current);
    if (projectId) trackClient("snippet_copied", { projectId });
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      selectSnippet();
      setStatus("manual");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={onCopy}>
        {status === "copied" ? "Copied" : "Copy"}
      </Button>
      <span aria-live="polite" className="text-xs text-muted">
        {status === "copied" && "Copied to your clipboard."}
        {status === "manual" && "Selected. Press Ctrl+C (⌘C on Mac) to copy."}
      </span>
    </div>
  );
}
