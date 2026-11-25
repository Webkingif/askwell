"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Delay in ms once the element scrolls into view. */
  delay?: number;
}

/**
 * Fades and lifts its children in when they scroll into view.
 * Only hides content when motion is allowed; reduced-motion users see it at once.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion needs no JS: the hidden styles are motion-safe only.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={shown ? "shown" : "hidden"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cx(
        "transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none",
        "motion-safe:data-[reveal=hidden]:translate-y-6 motion-safe:data-[reveal=hidden]:opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
