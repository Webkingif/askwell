import { cx } from "../ui";

/** A monochrome progress bar for used / limit. */
export function UsageBar({
  used,
  limit,
  label,
  className,
}: {
  used: number;
  limit: number;
  label: string;
  className?: string;
}) {
  const shown = Math.min(used, limit);
  const percent = limit > 0 ? Math.round((shown / limit) * 100) : 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={shown}
      className={cx(
        "h-2 w-full overflow-hidden rounded-full bg-subtle",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
