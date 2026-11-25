import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label: string;
  /** Hide the label visually; it stays for screen readers. */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
}

export function Input({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex w-full flex-col gap-1.5", className)}>
      <label
        htmlFor={inputId}
        className={cx("text-sm font-medium text-fg", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "focus-ring h-10 w-full min-w-0 rounded-md border bg-glass px-3 text-sm text-fg",
          "placeholder:text-muted backdrop-blur-glass transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-danger" : "border-line hover:border-muted",
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
