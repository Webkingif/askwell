import type {
  KnowledgeSource,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from "@askwell/shared";

/** What an owner sees. `uploading` is shown as processing (project.md §6.4). */
export const STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  uploading: "Processing",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export const TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  text: "Text",
  pdf: "PDF",
  md: "Markdown",
  txt: "TXT",
};

/** Still on its way to `ready` or `failed`. */
export const isPending = (s: Pick<KnowledgeSource, "status">) =>
  s.status === "uploading" || s.status === "processing";

/** How often the list refreshes while a source is processing. */
export const POLL_MS = 3000;
/** Stop refreshing after this long, in case a source never settles. */
export const POLL_MAX_MS = 10 * 60 * 1000;

// UTC, so the server render and the browser agree.
const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "2 of 3 sources" */
export function usageLabel(count: number, limit: number): string {
  return `${count} of ${limit} ${limit === 1 ? "source" : "sources"}`;
}
