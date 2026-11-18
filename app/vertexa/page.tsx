import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { VertexaStoryGallery } from "@/components/vertexa/story-gallery";
import { HoverRevealWords } from "@/components/vertexa/hover-reveal-words";
import { VertexaTestimonials } from "@/components/vertexa/testimonials";

export const metadata: Metadata = {
  title: { absolute: "Vertexa Group | Homes shaped around you" },
  description:
    "Custom homes, renovations, and extensions shaped around the people who live in them.",
};

const collaborators = [
  { name: "Cumulus Studio", role: "Award winning architecture" },
  { name: "Sussex", role: "Australian leading tapware" },
  { name: "Sketch Design & Interiors", role: "Architects" },
  { name: "Miele", role: "Premium appliances" },
  { name: "Bespoke", role: "Windows and doors" },
];

export default function VertexaPage() {
  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="vx-intro" aria-hidden="true">
        <span className="vx-intro-mark">
          <span className="vx-symbol">
            <span />
            <span />
            <span />
            <span />
          </span>
        </span>
      </div>

      <VertexaNavigation />

      <section className="vx-hero" id="main-content" aria-labelledby="vx-hero-title">
        <div className="vx-hero-title-wrap">
          <p className="vx-hero-description">
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
        <h2 id="vx-featured-projects-title">
          <HoverRevealWords text="Featured Projects" />
        </h2>
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
              <Link className="vx-featured-projects-link" href="/vertexa/projects">
                See all projects <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
        <div className="vx-featured-projects-gallery">
          <Link
            className="vx-featured-project vx-featured-project-main"
            href="/vertexa/projects?service=custom-homes"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1800&q=88')",
            }}
            id="custom-homes"
            aria-label="View custom home projects"
          >
            <span>Custom homes <span aria-hidden="true">↗</span></span>
          </Link>
          <div className="vx-featured-projects-secondary">
            <Link
              className="vx-featured-project vx-featured-project-left"
              href="/vertexa/projects?service=renovations"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=88')",
              }}
              id="renovations"
              aria-label="View renovation projects"
            >
              <span>Renovations <span aria-hidden="true">↗</span></span>
            </Link>
            <Link
              className="vx-featured-project vx-featured-project-right"
              href="/vertexa/projects?service=extensions"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=88')",
              }}
              id="extensions"
              aria-label="View home extension projects"
            >
              <span>Extensions <span aria-hidden="true">↗</span></span>
            </Link>
          </div>
        </div>
      </section>

      <section
        className="vx-collaborators-section"
        id="collaborators"
        aria-labelledby="vx-collaborators-title"
      >
        <div className="vx-collaborators-content">
          <div className="vx-collaborators-info" data-reveal="up">
            <p className="vx-collaborators-label" id="vx-collaborators-title">
              <span className="vx-collaborators-dot" aria-hidden="true" />
              Our collaborators
            </p>
            <div className="vx-collaborators-divider" />
            <p className="vx-collaborators-copy">
              Vertexa partners with leading architects and designers to realise ideas with integrity and precision. Our relationships are built on trust, detail, and shared respect for design.
            </p>
            <div className="vx-collaborators-list">
              {collaborators.map((collaborator) => (
                <div key={collaborator.name} className="vx-collaborators-item">
                  <span className="vx-collaborators-name">{collaborator.name}</span>
                  <span className="vx-collaborators-role">{collaborator.role}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="vx-collaborators-media" data-reveal="image">
            <Image
              src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=86"
              alt="Architectural wood joinery and craftsmanship detail"
              width={926}
              height={728}
              className="vx-collaborators-image"
              sizes="(max-width: 760px) 100vw, 55vw"
              unoptimized
            />
          </div>
        </div>
      </section>

      <div className="vx-testimonials-wrapper">
        <VertexaTestimonials />
      </div>

      <VertexaSiteFooter />
    </main>
  );
}
