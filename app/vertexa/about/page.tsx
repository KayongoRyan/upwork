import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import { VertexaCollaboratorsSection } from "@/components/vertexa/collaborators-section";
import { vertexaAwards } from "@/lib/vertexa-awards";

export const metadata: Metadata = {
  title: { absolute: "About | Vertexa Group" },
  description:
    "Three generations of bespoke craftsmanship, precision and quiet luxury. Meet the people and philosophy behind Vertexa Group.",
};

const storyImages = [
  {
    image:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=86",
    alt: "Open living space with timber floors and garden outlook",
  },
  {
    image:
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=86",
    alt: "Warm interior detail with natural stone and filtered light",
  },
  {
    image:
      "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=1200&q=86",
    alt: "Crafted kitchen joinery with integrated appliances",
  },
];

const peopleImages = [
  {
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=86",
    alt: "Renovated interior combining original details with modern joinery",
  },
  {
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=86",
    alt: "Contemporary home exterior framed by established gardens",
  },
];

export default function AboutPage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-about-intro" id="main-content">
        <h1 className="vx-about-heading">
          <RevealText
            text="Defined by precision, modernity and quiet luxury"
            stagger={38}
          />
        </h1>

        <div className="vx-about-rule" />

        <div className="vx-about-intro-grid">
          <p className="vx-about-eyebrow">
            <span className="vx-about-dot" aria-hidden="true" />
            About us
          </p>

          <div className="vx-about-copy">
            <p>
              <RevealText
                text="Across three generations, we’ve developed a building practice grounded in bespoke craftsmanship. We work closely with leading architects and consultants to bring ideas and dreams into reality. Every project reflects our commitment to creating spaces that are not only visually striking but also thoughtfully functional, tailored to the way people live."
                stagger={7}
              />
            </p>
            <p>
              <RevealText
                text="At Vertexa, we don’t just build homes—we craft experiences."
                stagger={18}
              />
            </p>
          </div>
        </div>
      </section>

      <section className="vx-about-media" aria-label="Inside a Vertexa home">
        <figure className="vx-about-media-frame" data-reveal="image">
          <span
            className="vx-about-media-image"
            role="img"
            aria-label="Architects reviewing plans together in a design studio"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=2000&q=88')",
            }}
          />
        </figure>
      </section>

      <section
        className="vx-about-section"
        aria-labelledby="vx-about-story-title"
      >
        <h2 className="vx-about-heading" id="vx-about-story-title">
          <RevealText
            text="Three generations. One philosophy."
            stagger={34}
          />
        </h2>

        <div className="vx-about-rule" />

        <div className="vx-about-grid">
          <p className="vx-about-eyebrow">
            <span className="vx-about-dot" aria-hidden="true" />
            Our story
          </p>

          <div className="vx-about-copy">
            <p>
              <RevealText
                text="What began as a family trade has evolved into a pursuit of design excellence. We’re driven by the details others overlook — the join, the line, the finish — because these are where the defining moments come alive. Vertexa emerged from a lifelong immersion in the world of building, where every generation has contributed to a shared legacy of skill, dedication and pride in craft. That evolution is guided by a simple principle: do it right, every step of the way."
                stagger={6}
              />
            </p>
          </div>
        </div>
      </section>

      <section
        className="vx-about-strip vx-about-strip-three"
        aria-label="Craft and material detail"
      >
        <div
          className="vx-about-strip-grid"
          role="group"
          aria-label="Craft and material detail gallery"
          tabIndex={0}
        >
          {storyImages.map((item) => (
            <figure
              className="vx-about-figure"
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

      <section
        className="vx-about-section vx-about-section-people"
        aria-labelledby="vx-about-people-title"
      >
        <h2 className="vx-about-heading" id="vx-about-people-title">
          <RevealText text="People of precision" stagger={34} />
        </h2>

        <div className="vx-about-rule" />

        <div className="vx-about-grid">
          <p className="vx-about-eyebrow">
            <span className="vx-about-dot" aria-hidden="true" />
            No compromise
          </p>

          <div className="vx-about-copy">
            <p>
              <RevealText
                text="Precision is at the heart of everything we do. Every element, whether structural, material or aesthetic, is carefully considered and executed to achieve perfection. Our relentless pursuit of precision ensures every home is more than a building; it is an experience, engineered for beauty, functionality and enduring quality. Our work is guided by a philosophy of continuous improvement, embracing challenges to push the boundaries of design and construction."
                stagger={6}
              />
            </p>
          </div>
        </div>
      </section>

      <section
        className="vx-about-strip vx-about-strip-two"
        aria-label="People and places behind the work"
      >
        <div
          className="vx-about-strip-grid"
          role="group"
          aria-label="People and places behind the work"
          tabIndex={0}
        >
          {peopleImages.map((item) => (
            <figure
              className="vx-about-figure"
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

      <VertexaCollaboratorsSection />

      <section
        className="vx-about-awards"
        aria-labelledby="vx-about-awards-title"
      >
        <h2 className="vx-projects-section-title" id="vx-about-awards-title">
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
