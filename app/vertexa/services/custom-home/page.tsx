import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { ServiceInquiryForm } from "@/components/vertexa/service-inquiry-form";

export const metadata: Metadata = {
  title: { absolute: "Custom Home Construction | Vertexa Group" },
  description:
    "Bespoke custom homes designed and built by Vertexa. From site selection to final detailing, we create homes shaped around the people who live in them.",
};

const scopeItems = [
  "Site analysis and orientation",
  "Architectural collaboration",
  "Bespoke kitchen and joinery",
  "Material selection and finishes",
  "Interior design coordination",
  "Final detailing and handover",
];

const processSteps = [
  {
    title: "Brief and site",
    body: "We start with your brief and the site — orientation, views, slope, and neighbourhood context — so the design responds to place from the first line.",
  },
  {
    title: "Design development",
    body: "Working alongside your architect, we shape the plan, resolve the junctions, and select materials that age well. Texture over colour, always.",
  },
  {
    title: "Construction",
    body: "We build with a small, consistent team so quality stays high and accountability is clear. Every junction is resolved on site as we go.",
  },
  {
    title: "Completion",
    body: "Final detailing, defect-free handover, and a home that feels settled from the moment you walk through the door.",
  },
];

export default function CustomHomePage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-service-hero" aria-label="Custom home construction hero">
        <div className="vx-service-hero-wrap">
          <p className="vx-service-label">
            <span className="vx-service-dot" aria-hidden="true" />
            Custom Home Construction
          </p>

          <h1 className="vx-service-heading" id="vx-service-title">
            <RevealText text="A home built for you" stagger={40} />
          </h1>

          <div className="vx-service-rule" />

          <div className="vx-service-hero-grid">
            <p className="vx-service-eyebrow">
              <span className="vx-service-dot-sm" aria-hidden="true" />
              Bespoke from the ground up
            </p>

            <div className="vx-service-copy">
              <p>
                <RevealText
                  text="We design and build custom homes for clients who value refinement over repetition. From site selection to final detailing, every decision is made with the people who will live in the house in mind — their routines, their aspirations, and the way they want to live."
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
          <RevealText text="How we build" stagger={30} />
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
              <RevealText text="Start your project" stagger={30} />
            </h2>
            <div className="vx-service-divider" />
            <p className="vx-service-inquiry-copy">
              Tell us about your custom home project and a project manager will be in touch within one business day.
            </p>
          </div>
          <div className="vx-service-inquiry-form">
            <ServiceInquiryForm service="custom-homes" />
          </div>
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
