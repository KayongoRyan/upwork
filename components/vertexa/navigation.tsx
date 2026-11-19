"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function VertexaNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFooterInView, setIsFooterInView] = useState(false);
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const isProjectsSection = pathname.startsWith("/vertexa/projects");
  const isProjectsIndex = pathname === "/vertexa/projects";
  const isCollaborators = pathname === "/vertexa/collaborators";
  const isAbout = pathname === "/vertexa/about";

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 24);

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    const footer = document.querySelector(".vx-footer");
    if (footer === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsFooterInView(entry.isIntersecting),
      { threshold: 0.08 },
    );
    observer.observe(footer);

    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    const dismiss = { ready: false };
    const timeout = window.setTimeout(() => {
      dismiss.ready = true;
    }, 0);

    function handlePointerDown(event: PointerEvent) {
      if (!dismiss.ready) return;
      if (headerRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    }

    function handleResize() {
      if (window.innerWidth < 1024) return;
      setIsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleResize);

    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    panelRef.current
      ?.querySelectorAll<HTMLDetailsElement>(".vx-menu-services[open]")
      .forEach((details) => details.removeAttribute("open"));
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  function toggleMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setIsOpen((open) => !open);
  }

  return (
    <header
      ref={headerRef}
      className="vx-header"
      data-menu-open={isOpen}
      data-scrolled={isScrolled}
      data-footer-in-view={isFooterInView}
      data-page-intro={pathname === "/vertexa"}
    >
      <Link className="vx-wordmark" href="/vertexa" aria-label="Vertexa Group home">
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

      <div className="vx-menu">
        <button
          ref={menuButtonRef}
          className="vx-menu-toggle"
          type="button"
          aria-label={isOpen ? "Close main navigation" : "Open main navigation"}
          aria-expanded={isOpen}
          aria-controls="vx-main-navigation"
          onClick={toggleMenu}
        >
          <span className="vx-menu-label">Menu</span>
          <span className="vx-menu-icon" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>

        <nav
          ref={panelRef}
          className="vx-menu-panel"
          id="vx-main-navigation"
          aria-label="Main navigation"
          inert={!isOpen}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) {
              closeMenu();
            }
          }}
        >
          <div className="vx-menu-panel-inner">
            <Link
              href="/vertexa/projects"
              aria-current={
                isProjectsSection ? (isProjectsIndex ? "page" : "true") : undefined
              }
            >
              Projects
            </Link>
            <Link
              href="/vertexa/collaborators"
              aria-current={isCollaborators ? "page" : undefined}
            >
              Our collaborators
            </Link>
            <Link
              href="/vertexa/about"
              aria-current={isAbout ? "page" : undefined}
            >
              About
            </Link>
            <details className="vx-menu-services">
              <summary>Our Services</summary>
              <div className="vx-menu-services-panel">
                <ul>
                  <li>
                    <Link
                      href="/vertexa/services/custom-home"
                      aria-current={pathname === "/vertexa/services/custom-home" ? "page" : undefined}
                    >
                      Custom Home Construction
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/vertexa/services/renovation"
                      aria-current={pathname === "/vertexa/services/renovation" ? "page" : undefined}
                    >
                      Home Renovations
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/vertexa/services/extension"
                      aria-current={pathname === "/vertexa/services/extension" ? "page" : undefined}
                    >
                      Home Extensions
                    </Link>
                  </li>
                </ul>
              </div>
            </details>
            <Link href="/vertexa/contact">Contact</Link>
          </div>
        </nav>
      </div>

      <Link
        className="vx-header-contact"
        href="/vertexa/contact"
        onClick={closeMenu}
      >
        Let&apos;s Talk
      </Link>
    </header>
  );
}
