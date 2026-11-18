"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function VertexaNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const isProjectsSection = pathname.startsWith("/vertexa/projects");
  const isProjectsIndex = pathname === "/vertexa/projects";
  const isCollaborators = pathname === "/vertexa/collaborators";
  const isAbout = pathname === "/vertexa/about";

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    panelRef.current
      ?.querySelectorAll<HTMLDetailsElement>(".vx-menu-services[open]")
      .forEach((details) => details.removeAttribute("open"));
  }, [isOpen]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".vertexa");
    if (root === null) return;

    const markIntroComplete = () => root.classList.add("vx-menu-intro-complete");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markIntroComplete();
      return;
    }

    const timer = window.setTimeout(markIntroComplete, 2400);
    return () => window.clearTimeout(timer);
  }, []);

  function markMenuIntroComplete() {
    document.querySelector<HTMLElement>(".vertexa")?.classList.add("vx-menu-intro-complete");
  }

  function closeMenu() {
    markMenuIntroComplete();
    setIsOpen(false);
  }

  function toggleMenu() {
    markMenuIntroComplete();
    setIsOpen((open) => !open);
  }

  return (
    <>
      {isOpen && (
        <button
          className="vx-menu-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />
      )}

      <header
        className="vx-header"
        data-menu-open={isOpen}
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
    </>
  );
}