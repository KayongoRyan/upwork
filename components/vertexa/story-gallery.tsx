"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const storyImage =
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=88";

function updateStoryImage(
  section: HTMLElement,
  image: HTMLElement,
  copy: NodeListOf<HTMLElement>,
  isStatic: MediaQueryList,
) {
  if (isStatic.matches) {
    image.style.removeProperty("width");
    image.style.removeProperty("height");
    copy.forEach((element) => element.style.removeProperty("opacity"));
    return;
  }

  const scrollRange = section.offsetHeight - window.innerHeight;
  const progress =
    scrollRange > 0
      ? Math.min(
          1,
          Math.max(0, -section.getBoundingClientRect().top / scrollRange),
        )
      : 0;
  const startWidth = window.innerWidth * 0.45;
  const startHeight = window.innerHeight * 0.45;

  image.style.width = `${startWidth + (window.innerWidth - startWidth) * progress}px`;
  image.style.height = `${startHeight + (window.innerHeight - startHeight) * progress}px`;

  const copyOpacity = Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.18);
  copy.forEach((element) => {
    element.style.opacity = String(copyOpacity);
  });
}

export function VertexaStoryGallery() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const storySection = sectionRef.current;
    if (storySection === null) return;

    const storyImageElement =
      storySection.querySelector<HTMLElement>(".vx-story-image");
    if (storyImageElement === null) return;

    const copy = storySection.querySelectorAll<HTMLElement>(
      ".vx-story-word, .vx-story-marker",
    );
    const isStatic = window.matchMedia(
      "(max-width: 760px), (prefers-reduced-motion: reduce)",
    );

    const updateImage = () =>
      updateStoryImage(storySection, storyImageElement, copy, isStatic);

    updateImage();
    window.addEventListener("scroll", updateImage, { passive: true });
    window.addEventListener("resize", updateImage);
    isStatic.addEventListener("change", updateImage);

    return () => {
      window.removeEventListener("scroll", updateImage);
      window.removeEventListener("resize", updateImage);
      isStatic.removeEventListener("change", updateImage);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="vx-story"
      id="philosophy"
      aria-labelledby="vx-story-title"
      data-story-gallery
    >
      <h2 className="vx-story-heading" id="vx-story-title">
        Bespoke homes, thoughtfully made.
      </h2>
      <div className="vx-story-stage" aria-hidden="true">
        <p className="vx-story-marker vx-story-marker-top">DESIGN / BUILD</p>
        <figure className="vx-story-image">
          <Image
            src={storyImage}
            alt=""
            fill
            sizes="(max-width: 760px) 82vw, 100vw"
            loading="eager"
            fetchPriority="high"
            unoptimized
          />
        </figure>
        <span className="vx-story-word vx-story-word-left">Bespoke</span>
        <span className="vx-story-word vx-story-word-right">Luxury</span>
        <p className="vx-story-marker vx-story-marker-bottom">VERTEXA GROUP</p>
      </div>
    </section>
  );
}
