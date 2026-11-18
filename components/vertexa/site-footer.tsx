import Link from "next/link";
import { portalUrl } from "@/lib/portals";

export function VertexaSiteFooter() {
  const workspaceUrl = portalUrl("administrator");

  return (
    <footer className="vx-footer" id="contact">
      <div className="vx-footer-top">
        <div className="vx-footer-nav-column">
          <p className="vx-footer-kicker" data-reveal="up">
            <span className="vx-footer-dot" />
            Homes shaped around you
          </p>
          <Link
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
          </Link>
          <nav className="vx-footer-nav" aria-label="Footer navigation" data-reveal="up">
            <Link href="/vertexa/about">About</Link>
            <Link href="/vertexa/projects">Projects</Link>
            <Link href="/vertexa/collaborators">Our collaborators</Link>
            <Link href="/vertexa#contact">Contact</Link>
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

      <Link
        className="vx-footer-giant"
        href="/vertexa"
        aria-label="Vertexa Group home"
        data-reveal="brand"
      >
        Vertexa
      </Link>

      <div className="vx-footer-bottom" data-reveal="up">
        <span>© {new Date().getFullYear()} Vertexa Group</span>
        <span>Thoughtful homes. Built for living.</span>
        <a href={workspaceUrl}>Project workspace <span aria-hidden="true">↗</span></a>
        <a href="#main-content">Back to top <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  );
}
