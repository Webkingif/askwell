import { PLAN_LIMITS, type Plan, type Project } from "@askwell/shared";

// A project's monthly message usage (project.md §5, §6.12). Pure: the caller
// reads the project (owner client) and the plan (ensureAccount) on the server.

export interface Usage {
  /** Accepted visitor messages this month (UTC). */
  used: number;
  /** The plan's messages per month, per project. */
  limit: number;
  /** ISO time the count resets: the first day of next month, 00:00 UTC. */
  resetsAt: string;
  /** used >= limit: the widget now shows visitors the quota message. */
  atLimit: boolean;
}

const monthStart = (d: Date) =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);

/**
 * consume_message resets messages_used lazily, on the first message of a new
 * month. Until then the stored count belongs to an earlier month, so a
 * period_start before the current UTC month means 0 used.
 */
export function currentUsage(
  project: Pick<Project, "messagesUsed" | "periodStart">,
  plan: Plan,
  now: Date,
): Usage {
  const limit = PLAN_LIMITS[plan].messagesPerMonth;
  const thisMonth = monthStart(now);
  const periodStart = new Date(project.periodStart).getTime();
  const used =
    Number.isFinite(periodStart) && periodStart >= thisMonth
      ? Math.max(project.messagesUsed, 0)
      : 0;
  const resetsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
  return { used, limit, resetsAt, atLimit: used >= limit };
}
