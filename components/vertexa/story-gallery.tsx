"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";

const storyImage =
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=88";

function clipEase(progress: number) {
  const x1 = 0.6;
  const y1 = 0;
  const x2 = 0.69;
  const y2 = 0.22;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sample = (a: number, b: number, c: number, t: number) => ((a * t + b) * t + c) * t;
  let u = progress;
  for (let i = 0; i < 8; i += 1) {
    const slope = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(slope) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - (sample(ax, bx, cx, u) - progress) / slope));
  }
  return sample(ay, by, cy, u);
}

function updateStoryImage(
  section: HTMLElement,
  image: HTMLElement,
  copy: NodeListOf<HTMLElement>,
  isStatic: MediaQueryList,
) {
  const left = section.querySelector<HTMLElement>(".vx-story-word-left");
  const right = section.querySelector<HTMLElement>(".vx-story-word-right");
  const top = section.querySelector<HTMLElement>(".vx-story-marker-top");
  const bottom = section.querySelector<HTMLElement>(".vx-story-marker-bottom");

  if (isStatic.matches) {
    for (const property of ["width", "height", "top", "left", "transform", "clip-path"]) {
      image.style.removeProperty(property);
    }
    for (const element of [left, right, top, bottom]) {
      element?.style.removeProperty("transform");
    }
    copy.forEach((element) => element.style.removeProperty("opacity"));
    return;
  }

  const travelRange = section.offsetHeight;
  const progress =
    travelRange > 0
      ? Math.min(
          1,
          Math.max(
            0,
            (window.innerHeight - section.getBoundingClientRect().top) / travelRange,
          ),
        )
      : 0;
  const eased = clipEase(progress);
  const wide = window.innerWidth >= 1024;
  const frame = wide ? 800 : 400;
  const insetY = Math.max(0, (window.innerHeight - frame) / 2) * (1 - eased);
  const insetX = Math.max(0, (window.innerWidth - frame) / 2) * (1 - eased);
  const travel = (wide ? 150 : 50) * (1 - progress);

  image.style.top = "0";
  image.style.left = "0";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.transform = `scale(${0.2 + 0.8 * progress})`;
  image.style.clipPath = `inset(${insetY}px ${insetX}px)`;

  if (left) left.style.transform = `translateY(-50%) translateX(${travel}px)`;
  if (right) right.style.transform = `translateY(-50%) translateX(${-travel}px)`;
  if (top) top.style.transform = `translateX(-50%) translateY(${travel}px)`;
  if (bottom) bottom.style.transform = `translateX(-50%) translateY(${-travel}px)`;

  const copyOpacity = Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.18);
  copy.forEach((element) => {
    element.style.opacity = String(copyOpacity);
  });
}

export function VertexaStoryGallery() {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
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
