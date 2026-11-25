import type { ElementType, HTMLAttributes } from "react";
import { cx } from "./cx";

export type GlassPanelPadding = "none" | "sm" | "md" | "lg";

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Defaults to div. */
  as?: "div" | "section" | "article" | "aside" | "header" | "footer" | "nav";
  padding?: GlassPanelPadding;
  /** Stronger blur, for panels over busy backgrounds. */
  strong?: boolean;
}

const paddings: Record<GlassPanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function GlassPanel({
  as = "div",
  padding = "md",
  strong = false,
  className,
  ...rest
}: GlassPanelProps) {
  const Tag: ElementType = as;
  return (
    <Tag
      className={cx(
        strong ? "glass-strong" : "glass",
        "rounded-xl",
        paddings[padding],
        className,
      )}
      {...rest}
    />
  );
}
