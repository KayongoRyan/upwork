import type { CSSProperties } from "react";

type ScrollRevealWordsProps = {
  text: string;
};

export function ScrollRevealWords({ text }: ScrollRevealWordsProps) {
  return (
    <span className="vx-word-reveal" aria-hidden="true">
      {text.split(/\s+/).map((word, index) => (
        <span
          className="vx-word-reveal__clip"
          key={`${word}-${index}`}
        >
          <span
            className="vx-word-reveal__word"
            style={{
              "--vx-word-start": `${index * 2.6}%`,
              "--vx-word-end": `${48 + index * 2.6}%`,
            } as CSSProperties}
          >
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}
