import type { Metadata } from "next";
import Link from "next/link";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";

export const metadata: Metadata = {
  title: { absolute: "Our Services | Vertexa Group" },
  description:
    "Custom home construction, home renovations, and home extensions. Vertexa builds considered homes shaped around the people who live in them.",
};

const serviceItems = [
  {
    id: "custom-homes" as const,
    label: "Custom Home Construction",
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=88",
    alt: "Light-filled contemporary living room opening onto a garden",
    copy:
      "From site selection to final detailing, we design and build bespoke homes that respond to the land and the people who will live in them.",
  },
  {
    id: "renovations" as const,
    label: "Home Renovations",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=88",
    alt: "Renovated terrace interior with original details and modern joinery",
    copy:
      "We rework existing homes with care — restoring original character, improving light and flow, and adding contemporary comfort where it matters.",
  },
  {
    id: "extensions" as const,
    label: "Home Extensions",
    image:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88",
    alt: "Glass-walled extension opening onto a private courtyard",
    copy:
      "Thoughtful additions that sit comfortably beside the original home — rear extensions, pavilions, and glazed links that open up space and light.",
  },
];

export default function ServicesPage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-services-intro" id="main-content" aria-labelledby="vx-services-title">
        <p className="vx-services-label">
          <span className="vx-services-dot" aria-hidden="true" />
          Our services
        </p>

        <h1 className="vx-services-heading" id="vx-services-title">
          <RevealText text="Homes shaped around you" stagger={40} />
        </h1>

        <div className="vx-services-rule" />

        <div className="vx-services-intro-grid">
          <p className="vx-services-eyebrow">
            <span className="vx-services-dot-sm" aria-hidden="true" />
            What we build
          </p>

          <div className="vx-services-copy">
            <p>
              <RevealText
                text="Vertexa builds custom homes, renovations and extensions for clients who value refinement over repetition. Every project is a direct response to the people who will live in it — their routines, their aspirations, and the way they want to live."
                stagger={7}
              />
            </p>
          </div>
        </div>
      </section>

      <section className="vx-services-grid-section" aria-label="Our services">
        <div className="vx-services-grid">
          {serviceItems.map((service) => (
            <article className="vx-service-card" key={service.id}>
              <Link
                key={service.id}
                className="vx-service-card-link"
                href={`/vertexa/services/${service.id}`}
                aria-label={`View ${service.label}`}
              >
                <span
                  className="vx-service-card-media"
                  role="img"
                  aria-label={service.alt}
                  style={{ backgroundImage: `url('${service.image}')` }}
                />
                <span className="vx-service-card-body">
                  <span className="vx-service-card-title">{service.label}</span>
                  <span className="vx-service-card-copy">{service.copy}</span>
                </span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
