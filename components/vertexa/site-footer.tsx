import Link from "next/link";

const FOOTER_FOUNDED_YEAR = 2018;

export function VertexaSiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="vx-footer" id="contact">
      <div className="vx-footer-top">
        <div className="vx-footer-nav-column">
          <p className="vx-footer-kicker" data-reveal="up">
            <span className="vx-footer-dot" aria-hidden="true" />
            Design / Build
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
            <Link href="/vertexa/services">Expertise</Link>
            <Link href="/vertexa/collaborators">For Architects</Link>
            <Link href="/vertexa/contact">Contact</Link>
          </nav>
        </div>

        <div className="vx-footer-side">
          <nav className="vx-footer-quicklinks" aria-label="Follow us" data-reveal="up">
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">
              Instagram <span aria-hidden="true">↗</span>
            </a>
            <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">
              Facebook <span aria-hidden="true">↗</span>
            </a>
          </nav>

          <Link
            className="vx-footer-feature"
            href="/vertexa/projects/calibre"
            data-reveal="up"
          >
            <span className="vx-footer-feature-label">
              <span className="vx-footer-dot" aria-hidden="true" />
              Recently completed
            </span>
            <span
              className="vx-footer-feature-image"
              role="img"
              aria-label="Calibre custom home"
              data-reveal="image"
              style={{
                backgroundImage:
                  "linear-gradient(0deg, rgba(17, 17, 17, 0.35), transparent 55%), url('https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=85')",
              }}
            />
            <span className="vx-footer-feature-link">
              Calibre · 2026 <span aria-hidden="true">↗</span>
            </span>
          </Link>
        </div>
      </div>

      <Link
        className="vx-footer-giant"
        href="/vertexa"
        aria-label="Vertexa Group home"
        data-reveal="brand"
      >
        Vertex<span>a</span>
      </Link>

      <div className="vx-footer-bottom" data-reveal="up">
        <small className="vx-footer-copyright">
          © {FOOTER_FOUNDED_YEAR}
          {currentYear > FOOTER_FOUNDED_YEAR ? `–${currentYear}` : ""} Vertexa Group
        </small>
        <a href="#main-content">
          Back to top <span aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}