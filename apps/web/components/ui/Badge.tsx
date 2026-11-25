import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeVariant = "solid" | "outline" | "glass";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  solid: "bg-accent text-accent-fg",
  outline: "border border-line text-fg",
  glass: "glass text-fg",
};

export function Badge({ variant = "outline", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}
