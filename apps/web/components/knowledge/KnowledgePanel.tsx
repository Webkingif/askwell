"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KnowledgeSource, Plan } from "@askwell/shared";
import { Badge, EmptyState, GlassPanel } from "../ui";
import { LimitNotice } from "./LimitNotice";
import { PasteForm } from "./PasteForm";
import { SourceRow } from "./SourceRow";
import { UploadForm } from "./UploadForm";
import { POLL_MAX_MS, POLL_MS, isPending, usageLabel } from "./status";

export interface KnowledgePanelProps {
  projectId: string;
  /** Newest first, loaded on the server through the owner client. */
  sources: KnowledgeSource[];
  plan: Plan;
  /** PLAN_LIMITS[plan].knowledgeSources */
  limit: number;
}

/** Refreshes the server data every POLL_MS while `active`, for at most POLL_MAX_MS. */
function usePolling(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_MAX_MS) return clearInterval(timer);
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
}

export function KnowledgePanel({
  projectId,
  sources,
  plan,
  limit,
}: KnowledgePanelProps) {
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  usePolling(sources.some(isPending));

  const atLimit = sources.length >= limit;
  // A refusal from the server stays until the list shows room again.
  const [seenCount, setSeenCount] = useState(sources.length);
  if (seenCount !== sources.length) {
    setSeenCount(sources.length);
    if (!atLimit) setLimitMessage(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel padding="none">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold text-fg">Sources</h2>
          <Badge variant="outline">{usageLabel(sources.length, limit)}</Badge>
        </div>
        {sources.length === 0 ? (
          <EmptyState
            title="Teach your bot about your business"
            message="Add text or files (PDF, Markdown, TXT) with your FAQs, policies and product details. The bot answers visitors from this knowledge only."
          />
        ) : (
          <ul aria-label="Knowledge sources" className="divide-y divide-line">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
        )}
      </GlassPanel>

      {(atLimit || limitMessage) && (
        <LimitNotice
          plan={plan}
          limit={limit}
          message={limitMessage ?? undefined}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel padding="md">
          <PasteForm projectId={projectId} onLimit={setLimitMessage} />
        </GlassPanel>
        <GlassPanel padding="md">
          <UploadForm projectId={projectId} onLimit={setLimitMessage} />
        </GlassPanel>
      </div>
    </div>
  );
}
