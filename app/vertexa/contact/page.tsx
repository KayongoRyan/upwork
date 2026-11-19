import type { Metadata } from "next";
import { Suspense } from "react";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { ContactForm } from "@/components/vertexa/contact-form";

export const metadata: Metadata = {
  title: { absolute: "Project inquiry | Vertexa Group" },
  description:
    "Submit a project inquiry to Vertexa Group — custom homes, renovations, and extensions across Rwanda.",
};

const detailItems = [
  {
    label: "Studio",
    value: "Kacyiru, Kigali",
    note: "By appointment",
  },
  {
    label: "Email",
    value: "hello@vertexagroup.com",
    href: "mailto:hello@vertexagroup.com",
  },
  {
    label: "Hours",
    value: "Monday–Friday",
    note: "9am–5pm",
  },
];

export default function ContactPage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section
        className="vx-contact-intro"
        id="main-content"
        aria-labelledby="vx-contact-title"
      >
        <p className="vx-contact-label">
          <span className="vx-contact-dot" aria-hidden="true" />
          Contact
        </p>

        <h1 className="vx-contact-heading" id="vx-contact-title">
          <RevealText text="Let’s talk about your project" stagger={40} />
        </h1>

        <div className="vx-contact-rule" />

        <div className="vx-contact-intro-grid">
          <p className="vx-contact-eyebrow">
            <span className="vx-contact-dot-sm" aria-hidden="true" />
            Get in touch
          </p>

          <div className="vx-contact-copy">
            <p>
              <RevealText
                text="Tell us about your site, brief, and timeline. We work closely with homeowners, architects, and designers from first sketch to final detail and respond within one business day."
                stagger={7}
              />
            </p>
          </div>
        </div>
      </section>

      <section className="vx-contact-section" aria-labelledby="vx-contact-details-title">
        <div className="vx-contact-grid">
          <div className="vx-contact-details">
            <h2 id="vx-contact-details-title" className="vx-contact-details-heading">
              <RevealText text="Studio" stagger={30} />
            </h2>
            <div className="vx-contact-divider" />
            <dl className="vx-contact-list">
              {detailItems.map((item) => (
                <div className="vx-contact-item" key={item.label}>
                  <dt className="vx-contact-item-label">{item.label}</dt>
                  <dd className="vx-contact-item-value">
                    {item.href ? (
                      <a href={item.href} className="vx-contact-item-link">
                        {item.value}
                      </a>
                    ) : (
                      item.value
                    )}
                  </dd>
                  {item.note && (
                    <span className="vx-contact-item-note">{item.note}</span>
                  )}
                </div>
              ))}
            </dl>
          </div>

          <div className="vx-contact-form-wrap">
            <Suspense fallback={<p className="vx-contact-sending">Loading form…</p>}>
              <ContactForm />
            </Suspense>
          </div>
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
