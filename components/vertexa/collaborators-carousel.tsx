"use client";

import { useState } from "react";

export type VertexaCollaboratorSlide = {
  image: string;
  alt: string;
  caption: string;
};

type CollaboratorsCarouselProps = {
  slides: VertexaCollaboratorSlide[];
};

export function VertexaCollaboratorsCarousel({
  slides,
}: CollaboratorsCarouselProps) {
  const [index, setIndex] = useState(0);
  const total = slides.length;

  const previous = () => setIndex((current) => (current - 1 + total) % total);
  const next = () => setIndex((current) => (current + 1) % total);

  return (
    <div className="vx-about-carousel">
      <div className="vx-about-carousel-stage">
        <div
          className="vx-about-carousel-track"
          style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        >
          {slides.map((slide, slideIndex) => (
            <div
              className="vx-about-carousel-slide"
              key={slide.caption}
              aria-hidden={slideIndex === index ? undefined : "true"}
            >
              <span
                className="vx-about-carousel-image"
                role="img"
                aria-label={slide.alt}
                style={{ backgroundImage: `url('${slide.image}')` }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="vx-about-carousel-footer">
        <p className="vx-about-carousel-caption" aria-live="polite">
          <span>
            {index + 1}/{total}
          </span>
          <span>{slides[index]?.caption}</span>
        </p>

        <div className="vx-about-carousel-controls">
          <button
            type="button"
            className="vx-about-carousel-button"
            onClick={previous}
            aria-label="Previous collaborator"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className="vx-about-carousel-button"
            onClick={next}
            aria-label="Next collaborator"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
