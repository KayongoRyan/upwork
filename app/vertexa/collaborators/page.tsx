import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { VertexaCollaboratorsSection } from "@/components/vertexa/collaborators-section";
import { vertexaAwards } from "@/lib/vertexa-awards";

export const metadata: Metadata = {
  title: { absolute: "Collaborators | Vertexa Group" },
  description:
    "Vertexa works alongside leading architects and designers, delivering built outcomes that remain true to intent from concept through to completion.",
};

const processCopy =
  "We bring deep construction expertise to complex architectural projects, joining the design team early to test buildability, budget and programme before ideas are committed. From junctions and tolerances to material transitions and trade sequencing, every decision is measured against the architect’s intent, documented clearly and shared openly. Our project leads stay in direct contact throughout construction—through samples, mock-ups and site walkthroughs—so issues are resolved early and the finished build reads as designed, down to the last shadow line.";

const processImages = [
  {
    image:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=86",
    alt: "Project team reviewing drawings on a residential building site",
  },
  {
    image:
      "https://images.unsplash.com/photo-1590725140246-20acdee442be?auto=format&fit=crop&w=1200&q=86",
    alt: "Architectural drawings and material samples laid out on a worktable",
  },
  {
    image:
      "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&q=86",
    alt: "Concrete and glass facade detail against a clear sky",
  },
];

export default function CollaboratorsPage() {
  return (
    <main className="vertexa vx-collaborators-page">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-about-intro" id="main-content">
        <h1 className="vx-about-heading">
          <RevealText
            text="Collaboration without compromise"
            stagger={40}
          />
        </h1>

        <div className="vx-about-rule" />

        <div className="vx-about-intro-grid">
          <p className="vx-about-eyebrow">
            <span className="vx-about-dot" aria-hidden="true" />
            For architects &amp; designers
          </p>

          <div className="vx-about-copy">
            <p>
              <RevealText
                text="At Vertexa, we understand the responsibility of realising architectural design. Our role is to deliver built outcomes that remain true to intent. Every proportion, junction and material is resolved and executed with precision, maintaining integrity from concept through to completion. Architectural projects rely on alignment between vision and execution, where the smallest decisions define the finished result."
                stagger={7}
              />
            </p>
          </div>
        </div>
      </section>

      <section
        className="vx-about-media vx-collab-hero"
        aria-label="Architect reviewing drawings on site"
      >
        <figure className="vx-about-media-frame">
          <span
            className="vx-about-media-image vx-collab-hero-image"
            role="img"
            aria-label="Architect marking a blueprint on a drafting table"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1590725140246-20acdee442be?auto=format&fit=crop&w=2600&h=1460&q=88')",
            }}
          />
        </figure>
      </section>

      <section
        className="vx-collab-process"
        aria-labelledby="vx-collab-process-title"
      >
        <h2 className="vx-about-heading" id="vx-collab-process-title">
          <RevealText
            text="Built for architectural collaboration"
            stagger={34}
          />
        </h2>

        <div className="vx-about-rule" />

        <div className="vx-about-grid">
          <p className="vx-about-eyebrow">
            <span className="vx-about-dot" aria-hidden="true" />
            Our process
          </p>

          <div className="vx-about-copy">
            <p>
              <RevealText text={processCopy} stagger={6} />
            </p>
          </div>
        </div>
      </section>

      <section
        className="vx-collab-strip"
        aria-label="Working alongside architects and makers"
      >
        <div
          className="vx-collab-strip-grid"
          role="group"
          aria-label="Working alongside architects and makers"
          tabIndex={0}
        >
          {processImages.map((item) => (
            <figure
              className="vx-collab-figure"
              key={item.image}
              data-reveal="image"
            >
              <span
                className="vx-about-figure-image"
                role="img"
                aria-label={item.alt}
                style={{ backgroundImage: `url('${item.image}')` }}
              />
            </figure>
          ))}
        </div>
      </section>

      <section className="vx-collab-quote" aria-label="Collaborator reflection">
        <figure className="vx-collab-quote-inner">
          <blockquote className="vx-collab-quote-text">
            <span className="vx-collab-quote-mark" aria-hidden="true">
              &ldquo;
            </span>
            <RevealText
              text="Vertexa bring an extraordinary level of care and precision to every decision. It felt like building with people who understood our vision better than we did."
              stagger={9}
            />
          </blockquote>

          <figcaption className="vx-collab-quote-credit">
            <span className="vx-about-dot" aria-hidden="true" />
            Sketch Design Rwanda
          </figcaption>
        </figure>
      </section>

      <VertexaCollaboratorsSection compactTitle />

      <section
        className="vx-about-awards"
        aria-labelledby="vx-collab-awards-title"
      >
        <h2 className="vx-projects-section-title" id="vx-collab-awards-title">
          <span className="vx-projects-dot" aria-hidden="true" />
          Awards
        </h2>

        <div className="vx-awards-list">
          {vertexaAwards.map((award) => (
            <div
              className="vx-award"
              key={`${award.organisation}-${award.award}`}
            >
              <span className="vx-award-organisation">
                {award.organisation}
              </span>
              <span className="vx-award-name">{award.award}</span>
              <span className="vx-award-year">&rsquo;{award.year}</span>
            </div>
          ))}
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
