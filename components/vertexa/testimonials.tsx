"use client";

import { useState } from "react";

const testimonials = [
  {
    name: "Sarah Mukamana",
    role: "Homeowner, Kigali",
    quote:
      "Working with Vertexa was a seamless experience. Their attention to detail and ability to translate our ideas into a home that feels truly ours stood out.",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
  },
  {
    name: "James Oduya",
    role: "Property Developer",
    quote:
      "From the first conversation to handover, Vertexa brought a level of craft and care that exceeded every expectation. We will not build with anyone else.",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
  },
  {
    name: "Amina Hassan",
    role: "Architect, Nairobi",
    quote:
      "Vertexa are exceptional collaborators. They respect the design intent down to the last detail, and their craftsmanship speaks for itself on every project.",
    avatar:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
  },
  {
    name: "Michael Rutherford",
    role: "Interior Designer",
    quote:
      "The team brought precision and genuine passion to every phase of the build. A rare combination that made our collaboration effortless.",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  },
  {
    name: "Leila Ndayisaba",
    role: "Homeowner, Musanze",
    quote:
      "Every room reflects exactly what we envisioned — and more. Vertexa listened, refined, and delivered a home shaped entirely around us.",
    avatar:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80",
  },
];

export function VertexaTestimonials() {
  const [active, setActive] = useState(0);
  const count = testimonials.length;

  function prev() {
    setActive((a) => (a - 1 + count) % count);
  }
  function next() {
    setActive((a) => (a + 1) % count);
  }

  const t = testimonials[active];

  return (
    <section
      className="vx-testimonials-section"
      id="testimonials"
      aria-labelledby="vx-testimonials-heading"
    >
      {/* Top row: label + subtitle/CTA */}
      <div className="vx-testimonials-top">
        <p className="vx-testimonials-label">
          <span className="vx-testimonials-dot" aria-hidden="true" />
          Testimonials
        </p>
        <div className="vx-testimonials-cta-wrap">
          <p className="vx-testimonials-subtitle">
            Real feedback from clients who trusted us to deliver their home.
          </p>
          <a className="vx-testimonials-cta" href="#contact">
            Work With Us <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      {/* Large heading */}
      <div
        className="vx-testimonials-heading"
        id="vx-testimonials-heading"
        aria-label="Client Feedback"
      >
        <span className="vx-testimonials-heading-black">Client</span>
        <span className="vx-testimonials-heading-orange">Feedback</span>
      </div>

      {/* Quote body */}
      <div className="vx-testimonials-body">
        <span className="vx-testimonials-quote-icon" aria-hidden="true">
          &ldquo;
        </span>
        <blockquote className="vx-testimonials-quote" key={active}>
          {t.quote}
        </blockquote>
        <div className="vx-testimonials-meta">
          <div>
            <p className="vx-testimonials-name">{t.name}</p>
            <p className="vx-testimonials-role">{t.role}</p>
          </div>
          <div
            className="vx-testimonials-nav"
            role="group"
            aria-label="Testimonial navigation"
          >
            <button
              className="vx-testimonials-nav-btn"
              onClick={prev}
              aria-label="Previous testimonial"
            >
              ←
            </button>
            <button
              className="vx-testimonials-nav-btn"
              onClick={next}
              aria-label="Next testimonial"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Portrait thumbnail strip */}
      <div
        className="vx-testimonials-strip"
        role="list"
        aria-label="Client portraits"
      >
        {testimonials.map((item, i) => (
          <button
            key={item.name}
            className={`vx-testimonials-thumb${i === active ? " vx-testimonials-thumb--active" : ""}`}
            onClick={() => setActive(i)}
            aria-label={`View testimonial from ${item.name}`}
            aria-pressed={i === active}
            role="listitem"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.avatar} alt={item.name} width={80} height={80} />
          </button>
        ))}
      </div>
    </section>
  );
}
