import type { Metadata } from "next";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaStoryGallery } from "@/components/vertexa/story-gallery";
import { portalUrl } from "@/lib/portals";

export const metadata: Metadata = {
  title: { absolute: "Vertexa Group | Homes shaped around you" },
  description:
    "Custom homes, renovations, and extensions shaped around the people who live in them.",
};

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

      <section className="vx-media-spotlight" aria-label="Featured home interior video">
        <div className="vx-media-frame">
          <video
            className="vx-media-video"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="https://images.pexels.com/videos/31617692/luxury-kitchen-mansion-new-homes-remodeling-31617692.jpeg?auto=compress&cs=tinysrgb&w=1920"
            aria-hidden="true"
          >
            <source
              src="https://videos.pexels.com/video-files/31617692/13470975_1920_1080_24fps.mp4"
              type="video/mp4"
            />
          </video>
        </div>
      </section>

      <VertexaStoryGallery />

      <section className="vx-values-section" id="values" aria-labelledby="vx-values-title">
        <h2 id="vx-values-title">Our guiding values</h2>
        <div className="vx-values-content">
          <p className="vx-values-label">Philosophy</p>
          <div className="vx-values-story">
            <div className="vx-values-copy">
              <p>
                Our homes go beyond construction. They are thoughtful responses
                to how you live: refined, comfortable, and unmistakably
                personal. Through close collaboration, we bring precision,
                considered design, and careful craftsmanship together.
              </p>
              <p>
                Every project is a chance to explore, refine, and build with
                intent. The result is a home that feels naturally yours, made
                to last and defined by quiet confidence.
              </p>
            </div>
            <div
              className="vx-values-image"
              role="img"
              aria-label="Craftspeople working together on a considered home"
            />
          </div>
        </div>
      </section>

      <section className="vx-featured-projects" id="projects" aria-labelledby="vx-featured-projects-title">
        <h2 id="vx-featured-projects-title">Featured Projects</h2>
        <div className="vx-featured-projects-content">
          <p className="vx-featured-projects-label">Go beyond bricks and mortar</p>
          <div className="vx-featured-projects-story">
            <div className="vx-featured-projects-copy">
              <p>
                Our projects are the result of trust, close collaboration, and
                an uncompromising approach to quality. We take on a considered
                number of projects at a time, giving every home the focus and
                care it deserves.
              </p>
              <p>
                From first sketch to final detail, we bring continuity,
                accountability, and thoughtful craftsmanship to every build.
                Each home is made with precision, purpose, and a lasting sense
                of belonging.
              </p>
              <a className="vx-featured-projects-link" href="#contact">
                See all projects <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
        <div className="vx-featured-projects-gallery">
          <a
            className="vx-featured-project vx-featured-project-main"
            href="#contact"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1800&q=88')",
            }}
            aria-label="Discuss a custom home project"
          >
            <span>Custom homes <span aria-hidden="true">↗</span></span>
          </a>
          <div className="vx-featured-projects-secondary">
            <a
              className="vx-featured-project vx-featured-project-left"
              href="#contact"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=88')",
              }}
              aria-label="Discuss a renovation project"
            >
              <span>Renovations <span aria-hidden="true">↗</span></span>
            </a>
            <a
              className="vx-featured-project vx-featured-project-right"
              href="#contact"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=88')",
              }}
              aria-label="Discuss a home extension project"
            >
              <span>Extensions <span aria-hidden="true">↗</span></span>
            </a>
          </div>
        </div>
      </section>

      <footer className="vx-footer" id="contact">
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
              <a href="#philosophy">Bespoke homes</a>
              <a href="#values">Our values</a>
              <a href="#projects">Featured projects</a>
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
