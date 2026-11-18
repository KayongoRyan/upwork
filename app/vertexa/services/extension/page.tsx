import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { ServiceInquiryForm } from "@/components/vertexa/service-inquiry-form";

export const metadata: Metadata = {
  title: { absolute: "Home Extensions | Vertexa Group" },
  description:
    "Thoughtful home extensions by Vertexa. Rear extensions, pavilions, and glazed links that open up space and light while sitting comfortably beside the original home.",
};

const scopeItems = [
  "Rear living and dining extensions",
  "Detached garden pavilions",
  "Glazed links and corridors",
  "Steel-framed glazing",
  "Courtyard gardens",
  "Interior joinery and finishes",
];

const processSteps = [
  {
    title: "Understand the original",
    body: "We start by understanding how the existing house works — its rhythm, its garden connection, its quiet corners — before deciding where an addition should go.",
  },
  {
    title: "Design the addition",
    body: "Extensions are designed as rooms in the garden or additions that sit comfortably beside the original. Glazing runs long, steel stays slim, and the garden reads as part of the interior.",
  },
  {
    title: "Build the connection",
    body: "The junction between old and new is the most carefully detailed part. Whether it's a steel beam, a glazed passage, or a new opening, it's resolved on site with precision.",
  },
  {
    title: "Complete",
    body: "Timber ceilings, polished concrete floors, and full-height glazing create a space that works equally well as a living room, studio, or place to sit with the doors open.",
  },
];

export default function ExtensionPage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-service-hero" aria-label="Home extensions hero">
        <div className="vx-service-hero-wrap">
          <p className="vx-service-label">
            <span className="vx-service-dot" aria-hidden="true" />
            Home Extensions
          </p>

          <h1 className="vx-service-heading" id="vx-service-title">
            <RevealText text="Space that belongs" stagger={40} />
          </h1>

          <div className="vx-service-rule" />

          <div className="vx-service-hero-grid">
            <p className="vx-service-eyebrow">
              <span className="vx-service-dot-sm" aria-hidden="true" />
              Thoughtful additions
            </p>

            <div className="vx-service-copy">
              <p>
                <RevealText
                  text="We design extensions that sit comfortably beside the original home — rear living and dining rooms, detached pavilions, and glazed links that open up space and light without overwhelming what already exists."
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
          <RevealText text="How we extend" stagger={30} />
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
              <RevealText text="Start your extension" stagger={30} />
            </h2>
            <div className="vx-service-divider" />
            <p className="vx-service-inquiry-copy">
              Tell us about your extension project and a project manager will be in touch within one business day.
            </p>
          </div>
          <div className="vx-service-inquiry-form">
            <ServiceInquiryForm service="extensions" />
          </div>
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
