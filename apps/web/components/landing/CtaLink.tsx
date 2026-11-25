import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "../ui";

export interface CtaLinkProps extends ComponentProps<typeof Link> {
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
}

/** A link styled like the kit's Button (components/ui/Button). */
export function CtaLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: CtaLinkProps) {
  return (
    <Link
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap",
        "transition-[background-color,color,border-color,opacity,box-shadow] duration-150 select-none",
        variant === "primary"
          ? "bg-accent text-accent-fg shadow-sm hover:opacity-90"
          : "glass text-fg hover:bg-subtle",
        size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm",
        className,
      )}
      {...rest}
    />
  );
}
