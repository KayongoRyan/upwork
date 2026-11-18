import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { ServiceInquiryForm } from "@/components/vertexa/service-inquiry-form";

export const metadata: Metadata = {
  title: { absolute: "Home Renovations | Vertexa Group" },
  description:
    "Thoughtful home renovations by Vertexa. Restoring original character, improving light and flow, and adding contemporary comfort to existing homes.",
};

const scopeItems = [
  "Heritage facade and detail restoration",
  "Internal reconfiguration and flow",
  "Kitchen and bathroom renewal",
  "Structural alterations",
  "Services and insulation upgrades",
  "Custom joinery and finishes",
];

const processSteps = [
  {
    title: "Assess the existing",
    body: "We look at what the house already does well — proportions, light, original details — and what needs to change. Renovation is about restraint as much as addition.",
  },
  {
    title: "Resolve the junctions",
    body: "Where old meets new, every junction is drawn and resolved on site. Original cornices, archways and floors are repaired rather than replaced wherever possible.",
  },
  {
    title: "Build the new",
    body: "New joinery picks up the same profiles in a contemporary language, so old and new read as one house rather than two different eras stitched together.",
  },
  {
    title: "Finish",
    body: "Services are upgraded throughout so the visible work stays quiet, and the house performs properly for another generation.",
  },
];

export default function RenovationPage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-service-hero" aria-label="Home renovations hero">
        <div className="vx-service-hero-wrap">
          <p className="vx-service-label">
            <span className="vx-service-dot" aria-hidden="true" />
            Home Renovations
          </p>

          <h1 className="vx-service-heading" id="vx-service-title">
            <RevealText text="Renewed with care" stagger={40} />
          </h1>

          <div className="vx-service-rule" />

          <div className="vx-service-hero-grid">
            <p className="vx-service-eyebrow">
              <span className="vx-service-dot-sm" aria-hidden="true" />
              Restoration and renewal
            </p>

            <div className="vx-service-copy">
              <p>
                <RevealText
                  text="We rework existing homes with care — restoring original character, improving light and flow, and adding contemporary comfort where it matters. The result is a home that reads as one, not as two different eras stitched together."
                  stagger={7}
                />
              </p>
            </div>
          </div>

          <aside className="vx-service-scope">
            <h3 className="vx-service-scope-title">Included</h3>
            <ul className="vx-service-scope-list">
              {scopeItems.map((item) => (
                <li key={item} className="vx-service-scope-item">
                  <span className="vx-service-scope-dot" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="vx-service-process" aria-labelledby="vx-service-process-title">
        <h2 id="vx-service-process-title" className="vx-service-process-heading">
          <RevealText text="How we renovate" stagger={30} />
        </h2>
        <div className="vx-service-rule" />

        <div className="vx-service-process-grid">
          {processSteps.map((step, index) => (
            <article key={step.title} className="vx-service-process-card">
              <span className="vx-service-process-number" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="vx-service-process-title">{step.title}</h3>
              <p className="vx-service-process-body">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="vx-service-inquiry" aria-labelledby="vx-service-inquiry-title">
        <div className="vx-service-inquiry-wrap">
          <div className="vx-service-inquiry-info">
            <h2 id="vx-service-inquiry-title" className="vx-service-inquiry-heading">
              <RevealText text="Start your renovation" stagger={30} />
            </h2>
            <div className="vx-service-divider" />
            <p className="vx-service-inquiry-copy">
              Tell us about your renovation project and a project manager will be in touch within one business day.
            </p>
          </div>
          <div className="vx-service-inquiry-form">
            <ServiceInquiryForm service="renovations" />
          </div>
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
