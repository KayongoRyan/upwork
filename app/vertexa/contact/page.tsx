import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { ContactForm } from "@/components/vertexa/contact-form";

export const metadata: Metadata = {
  title: { absolute: "Contact | Vertexa Group" },
  description:
    "Get in touch with Vertexa Group. We build custom homes, renovations and extensions across Western Australia.",
};

const detailItems = [
  {
    label: "Studio",
    value: "Subiaco, Western Australia",
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
          <RevealText text="Let’s build something together" stagger={40} />
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
                text="Have a project in mind? We work closely with homeowners, architects and designers from first sketch to final detail. Send us a message and we’ll get back to you within one business day."
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
              <RevealText text="Get in touch" stagger={30} />
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
            <ContactForm />
          </div>
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
