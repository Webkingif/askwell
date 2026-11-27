import Link from "next/link";
import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import type { Usage } from "../../lib/usage";
import { BILLING_PATH, projectTabPath } from "../dashboard/nav";
import { GlassPanel } from "../ui";
import { UsageBar } from "./UsageBar";
import { formatCount, formatResetDate, usageText } from "./format";

const PLAN_NAME: Record<Plan, string> = { free: "Free", pro: "Pro" };

/** The Usage tab: this month's messages against the plan's limit (project.md §6.12). */
export function UsagePanel({
  projectId,
  usage,
  plan,
}: {
  projectId: string;
  usage: Usage;
  plan: Plan;
}) {
  const { used, limit, resetsAt, atLimit } = usage;
  const resetDate = (
    <time dateTime={resetsAt}>{formatResetDate(resetsAt)}</time>
  );

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel padding="lg" as="section" aria-labelledby="usage-heading">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="usage-heading" className="text-sm font-medium text-muted">
              Messages this month
            </h2>
            <p className="text-2xl font-semibold tracking-tight break-words text-fg sm:text-3xl">
              {usageText(used, limit)} this month
            </p>
          </div>
          <UsageBar
            used={used}
            limit={limit}
            label="Messages used this month"
          />
          <div className="flex flex-col gap-1 text-sm text-muted sm:flex-row sm:justify-between">
            <p>Resets on {resetDate} (UTC).</p>
            <p>
              {PLAN_NAME[plan]} plan:{" "}
              {formatCount(PLAN_LIMITS[plan].messagesPerMonth)} messages per
              project each month.
            </p>
          </div>
          {used === 0 && (
            <p className="text-sm text-muted">
              No messages yet this month. Each visitor message the widget
              answers counts once.{" "}
              <Link
                href={projectTabPath(projectId, "install")}
                className="focus-ring rounded-sm font-medium text-fg underline"
              >
                Install the widget
              </Link>{" "}
              to start.
            </p>
          )}
        </div>
      </GlassPanel>

      {atLimit && (
        <div
          role="alert"
          className="glass flex flex-col gap-3 rounded-lg p-4 text-left sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-fg">
            This project has used all {formatCount(limit)} messages for this
            month. Until the count resets on {resetDate}, the widget shows
            visitors a message that it has reached its limit, instead of a
            reply.
          </p>
          {plan === "free" && (
            <Link
              href={BILLING_PATH}
              className="focus-ring inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Upgrade to Pro
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
