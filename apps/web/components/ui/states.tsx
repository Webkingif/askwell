import type { ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export interface StateProps {
  title: string;
  message?: string;
  /** Optional action, e.g. a Button or link. */
  action?: ReactNode;
  /** Optional icon shown above the title. */
  icon?: ReactNode;
  className?: string;
}

function StateLayout({
  title,
  message,
  action,
  icon,
  className,
  ...aria
}: StateProps & {
  role?: string;
  "aria-live"?: "polite" | "assertive";
  "aria-busy"?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex w-full flex-col items-center justify-center gap-3 px-4 py-10 text-center animate-fade-in",
        className,
      )}
      {...aria}
    >
      {icon && <div className="text-muted">{icon}</div>}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {message && <p className="max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Nothing to show yet. */
export function EmptyState(props: StateProps) {
  return <StateLayout {...props} />;
}

/** Data is on its way. */
export function LoadingState({ icon, ...props }: StateProps) {
  return (
    <StateLayout
      {...props}
      icon={icon ?? <Spinner size="lg" label={null} />}
      role="status"
      aria-live="polite"
      aria-busy
    />
  );
}

/** Something failed. Pass an action (e.g. a retry button) when the user can recover. */
export function ErrorState(props: StateProps) {
  return <StateLayout {...props} role="alert" />;
}
