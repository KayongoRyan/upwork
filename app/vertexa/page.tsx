import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { ScrollRevealWords } from "@/components/vertexa/scroll-reveal-words";
import { portalUrl } from "@/lib/portals";

export const metadata: Metadata = {
  title: { absolute: "Vertexa Group | Homes shaped around you" },
  description:
    "Custom homes, renovations, and extensions shaped around the people who live in them.",
};

const projects = [
  {
    name: "Custom homes",
    category: "A new beginning",
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=88",
    alt: "Modern home with an open, light-filled living space",
    className: "vx-project-feature",
  },
  {
    name: "Renovations",
    category: "A thoughtful reimagining",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=85",
    alt: "Carefully considered contemporary interior",
    className: "",
  },
  {
    name: "Extensions",
    category: "Space for what comes next",
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=85",
    alt: "Warm contemporary home opening onto a garden",
    className: "",
  },
];

export default function VertexaPage() {
  const workspaceUrl = portalUrl("administrator");

  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation workspaceUrl={workspaceUrl} />

      <section className="vx-hero" id="main-content" aria-labelledby="vx-hero-title">
        <div className="vx-hero-title-wrap">
          <p className="vx-hero-description" data-reveal="up">
            Thoughtful homes, built with care and shaped around the way you live.
          </p>
          <h1 id="vx-hero-title">Vertexa</h1>
        </div>
      </section>

      <section className="vx-hero-image-section" aria-label="Featured home">
        <div
          className="vx-hero-image"
          data-reveal="image"
          role="img"
          aria-label="Sculptural contemporary home framed by mature trees"
        >
          <div className="vx-hero-image-caption" data-reveal="up">
            <span>Considered spaces.</span>
            <span>Made for living.</span>
          </div>
          <a className="vx-round-link" href="#philosophy" aria-label="Discover Vertexa">
            <span aria-hidden="true">↘</span>
          </a>
        </div>
      </section>

      <section className="vx-philosophy" id="philosophy" aria-labelledby="vx-philosophy-title" data-flow-section>
        <div className="vx-section-label" data-reveal="up">
          <span>01</span>
          <span className="vx-label-rule" />
          <span>Our philosophy</span>
        </div>

        <div className="vx-philosophy-grid">
          <h2
            id="vx-philosophy-title"
            aria-label="A home should feel like it could only belong to you."
            data-word-reveal
          >
            <ScrollRevealWords text="A home should feel like it could only belong to you." />
          </h2>
          <div className="vx-philosophy-copy" data-reveal="up">
            <p>
              The best homes begin with a conversation. We listen to what matters
              to you, how you live, and what you want your home to make possible.
            </p>
            <p>
              From the first idea to the final detail, we bring care and clarity
              to the process of making a place your own.
            </p>
            <a className="vx-link" href="#approach">
              Get to know our approach <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div className="vx-values">
          <div data-reveal="up">
            <span>01 / PEOPLE FIRST</span>
            <p>Listen closely. Make it personal.</p>
          </div>
          <div data-reveal="up">
            <span>02 / THOUGHTFUL DESIGN</span>
            <p>Make every detail feel considered.</p>
          </div>
          <div data-reveal="up">
            <span>03 / BUILT WITH CARE</span>
            <p>Bring good ideas to life, together.</p>
          </div>
        </div>
      </section>

      <section
        className="vx-projects"
        id="projects"
        aria-labelledby="vx-projects-title"
        data-scroll-gallery
      >
        <div className="vx-projects-stage">
          <div className="vx-projects-heading">
            <div>
              <div className="vx-section-label" data-reveal="up">
                <span>02</span>
                <span className="vx-label-rule" />
                <span>What we build</span>
              </div>
              <h2
                id="vx-projects-title"
                aria-label="Room for your next chapter."
                data-word-reveal
              >
                <ScrollRevealWords text="Room for your next chapter." />
              </h2>
            </div>
            <p data-reveal="up">
              Whether you are starting fresh or reimagining the place you call
              home, every project starts with your vision.
            </p>
          </div>

          <div className="vx-project-grid">
            {projects.map((project, index) => (
              <article
                className={`vx-project ${project.className}`}
                key={project.name}
              >
                <a className="vx-project-image" href="#contact" data-reveal="image">
                  <span
                    className="vx-project-photo"
                    role="img"
                    aria-label={project.alt}
                    style={{ backgroundImage: `url('${project.image}')` }}
                  />
                  <span className="vx-project-arrow" aria-hidden="true">
                    ↗
                  </span>
                </a>
                <div className="vx-project-caption" data-reveal="up">
                  <div>
                    <span>{project.category}</span>
                    <h3 aria-label={project.name} data-word-reveal>
                      <ScrollRevealWords text={project.name} />
                    </h3>
                  </div>
                  <span className="vx-project-index">0{index + 1}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="vx-approach" id="approach" aria-labelledby="vx-approach-title" data-flow-section>
        <div
          className="vx-approach-image"
          data-reveal="image"
          role="img"
          aria-label="Quiet, natural-material interior with afternoon light"
        />
        <div className="vx-approach-copy">
          <div className="vx-section-label" data-reveal="up">
            <span>03</span>
            <span className="vx-label-rule" />
            <span>Working together</span>
          </div>
          <h2
            id="vx-approach-title"
            aria-label="Good things take good collaboration."
            data-word-reveal
          >
            <ScrollRevealWords text="Good things take good collaboration." />
          </h2>
          <p data-reveal="up">
            We bring your ideas, considered design, and careful building
            together. One clear conversation at a time, from first thoughts to
            the moment you step inside.
          </p>
          <a className="vx-link" href="#contact" data-reveal="up">
            Start a conversation <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="vx-contact" id="contact" aria-labelledby="vx-contact-title" data-flow-section>
        <p className="vx-eyebrow" data-reveal="up">Your place, your way</p>
        <h2
          id="vx-contact-title"
          aria-label="Have a home in mind? Let's talk about it."
          data-word-reveal
        >
          <ScrollRevealWords text="Have a home in mind?" />
          <br />
          <ScrollRevealWords text="Let's talk about it." />
        </h2>
        <a className="vx-contact-link" href="mailto:hello@vertexagroup.com" data-reveal="up">
          Get in touch <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className="vx-footer">
        <div className="vx-footer-top">
          <div className="vx-footer-nav-column">
            <p className="vx-footer-kicker" data-reveal="up">
              <span className="vx-footer-dot" />
              Homes shaped around you
            </p>
            <a
              className="vx-wordmark vx-footer-wordmark"
              href="/vertexa"
              aria-label="Vertexa Group home"
              data-reveal="up"
            >
              <span className="vx-symbol" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              <span className="vx-wordmark-name">
                VERTEXA <span>GROUP</span>
              </span>
            </a>
            <nav className="vx-footer-nav" aria-label="Footer navigation" data-reveal="up">
              <a href="#philosophy">Our philosophy</a>
              <a href="#projects">What we build</a>
              <a href="#approach">Our approach</a>
              <a href="#contact">Contact</a>
            </nav>
          </div>

          <div className="vx-footer-side">
            <nav
              className="vx-footer-quicklinks"
              aria-label="Contact links"
              data-reveal="up"
            >
              <a href="mailto:hello@vertexagroup.com">
                Email <span aria-hidden="true">↗</span>
              </a>
              <a href={workspaceUrl}>
                Project workspace <span aria-hidden="true">↗</span>
              </a>
            </nav>

            <a
              className="vx-footer-feature"
              href="mailto:hello@vertexagroup.com"
              data-reveal="up"
            >
              <span className="vx-footer-feature-label">
                <span className="vx-footer-dot" />
                Have a project in mind?
              </span>
              <span
                className="vx-footer-feature-image"
                role="img"
                aria-label="A warm, contemporary home and garden"
                data-reveal="image"
              />
              <span className="vx-footer-feature-link">
                Start a conversation <span aria-hidden="true">↗</span>
              </span>
            </a>
          </div>
        </div>

        <a
          className="vx-footer-giant"
          href="/vertexa"
          aria-label="Vertexa Group home"
          data-reveal="brand"
        >
          Vertexa
        </a>

        <div className="vx-footer-bottom" data-reveal="up">
          <span>© {new Date().getFullYear()} Vertexa Group</span>
          <span>Thoughtful homes. Built for living.</span>
          <a href={workspaceUrl}>Project workspace <span aria-hidden="true">↗</span></a>
          <a href="#main-content">Back to top <span aria-hidden="true">↑</span></a>
        </div>
      </footer>
    </main>
  );
}
