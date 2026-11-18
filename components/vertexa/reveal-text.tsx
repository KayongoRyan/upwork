"use client";

import { useEffect, useRef } from "react";

type RevealTextProps = {
  text: string;
  className?: string;
  stagger?: number;
  delay?: number;
};

/**
 * Splits copy into words and lifts each one into place as the block enters
 * the viewport, echoing the masked word reveals used across the Haven site.
 */
export function RevealText({
  text,
  className,
  stagger = 16,
  delay = 0,
}: RevealTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      root.dataset.revealed = "true";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          root.dataset.revealed = "true";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <span
      ref={rootRef}
      className={className ? `vx-reveal-words ${className}` : "vx-reveal-words"}
    >
      <span className="vx-visually-hidden">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <span className="vx-reveal-word" key={`${word}-${index}`}>
            <span
              className="vx-reveal-word__inner"
              style={{
                transitionDelay: `${delay + Math.min(index * stagger, stagger * 18)}ms`,
              }}
            >
              {word}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
