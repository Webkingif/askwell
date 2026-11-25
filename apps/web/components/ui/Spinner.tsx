import { cx } from "./cx";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Text for screen readers. Pass null when a parent already announces loading. */
  label?: string | null;
  className?: string;
}

const sizes: Record<SpinnerSize, string> = {
  sm: "size-4 border-2",
  md: "size-5 border-2",
  lg: "size-8 border-[3px]",
};

export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: SpinnerProps) {
  const ring = (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent",
        sizes[size],
        className,
      )}
    />
  );
  if (label === null) return ring;
  return (
    <span role="status" className="inline-flex items-center">
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}
