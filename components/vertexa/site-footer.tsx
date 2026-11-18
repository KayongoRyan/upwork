import Link from "next/link";

const FOOTER_FOUNDED_YEAR = 2018;

export function VertexaSiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="vx-footer" id="contact">
      <div className="vx-footer-scrim" aria-hidden="true" />
      <div className="vx-footer-inner">
        <div className="vx-footer-top">
          <div className="vx-footer-nav-block">
            <p className="vx-footer-eyebrow">
              <span className="vx-footer-dot" aria-hidden="true" />
              <span>Design / Build</span>
            </p>

            <Link className="vx-footer-mark" href="/vertexa" aria-label="Vertexa Group home">
              <span className="vx-symbol" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
            </Link>

            <nav className="vx-footer-nav" aria-label="Footer navigation">
              <Link href="/vertexa/about">About</Link>
              <Link href="/vertexa/projects">Projects</Link>
              <Link href="/vertexa/services">Expertise</Link>
              <Link href="/vertexa/collaborators">For Architects</Link>
              <Link href="/vertexa/contact">Contact</Link>
            </nav>
          </div>

          <div className="vx-footer-aside">
            <nav className="vx-footer-social" aria-label="Follow us">
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
              <a
                href="https://www.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook
              </a>
            </nav>

            <section className="vx-footer-recent" aria-label="Recently completed">
              <p className="vx-footer-recent-label">
                <span className="vx-footer-dot" aria-hidden="true" />
                <span>Recently completed</span>
              </p>
              <Link className="vx-footer-recent-card" href="/vertexa/projects/calibre">
                <span
                  className="vx-footer-recent-image"
                  role="img"
                  aria-label="Calibre custom home"
                  style={{
                    backgroundImage:
                      "url('https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=85')",
                  }}
                />
                <span className="vx-footer-recent-text">
                  <span className="vx-footer-recent-title">Calibre</span>
                  <span className="vx-footer-recent-year">2026</span>
                </span>
              </Link>
            </section>
          </div>
        </div>

        <Link
          className="vx-footer-giant"
          href="/vertexa"
          data-reveal="brand"
          aria-label="Vertexa Group home"
        >
          Vertex<span>a</span>
        </Link>

        <div className="vx-footer-bottom">
          <small className="vx-footer-copyright">
            © {FOOTER_FOUNDED_YEAR}
            {currentYear > FOOTER_FOUNDED_YEAR ? `–${currentYear}` : ""} Vertexa Group
          </small>
        </div>
      </div>
    </footer>
  );
}