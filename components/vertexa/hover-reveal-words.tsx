import type { CSSProperties } from "react";

type HoverRevealWordsProps = {
  text: string;
  scrollReveal?: boolean;
};

export function HoverRevealWords({
  text,
  scrollReveal = true,
}: HoverRevealWordsProps) {
  return (
    <span
      className="vx-hover-words"
      {...(scrollReveal ? { "data-word-reveal": true } : {})}
    >
      {text.split(/\s+/).map((word, index) => (
        <span className="vx-word-reveal__clip vx-hover-word" key={`${word}-${index}`}>
          <span
            className="vx-word-reveal__word vx-hover-word__inner"
            style={
              scrollReveal
                ? ({
                    "--vx-word-start": `${index * 2.6}%`,
                    "--vx-word-end": `${48 + index * 2.6}%`,
                  } as CSSProperties)
                : undefined
            }
          >
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}