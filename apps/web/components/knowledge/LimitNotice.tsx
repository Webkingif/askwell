import Link from "next/link";
import type { Plan } from "@askwell/shared";
import { BILLING_PATH } from "../dashboard/nav";

/** The plan's source limit is reached. Free gets a way to upgrade. */
export function LimitNotice({
  plan,
  limit,
  message,
}: {
  plan: Plan;
  limit: number;
  message?: string;
}) {
  const text =
    message ??
    (plan === "free"
      ? `The Free plan includes ${limit} knowledge sources per project. Upgrade to Pro for more.`
      : `You've reached your plan's limit of ${limit} knowledge sources per project. Delete one to add another.`);
  return (
    <div
      role="alert"
      className="glass flex flex-col gap-3 rounded-lg p-4 text-left sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-fg">{text}</p>
      <Link
        href={BILLING_PATH}
        className="focus-ring inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
      >
        {plan === "free" ? "Upgrade to Pro" : "Go to Billing"}
      </Link>
    </div>
  );
}
