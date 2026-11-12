"use client";

import { useEffect, useRef, useState } from "react";

type VertexaNavigationProps = {
  workspaceUrl: string;
};

export function VertexaNavigation({ workspaceUrl }: VertexaNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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

  function closeMenu() {
    setIsOpen(false);
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

      <header className="vx-header" data-menu-open={isOpen}>
        <a className="vx-wordmark" href="/vertexa" aria-label="Vertexa Group home">
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

        <div className="vx-menu">
          <button
            ref={menuButtonRef}
            className="vx-menu-toggle"
            type="button"
            aria-label={isOpen ? "Close main navigation" : "Open main navigation"}
            aria-expanded={isOpen}
            aria-controls="vx-main-navigation"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className="vx-menu-label">Menu</span>
            <span className="vx-menu-icon" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>

          <nav
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
            <a href="#philosophy">Bespoke homes</a>
            <a href="#values">Our values</a>
            <a href="#projects">Featured projects</a>
            <a href="#collaborators">Our collaborators</a>
            <a href="#contact">Contact</a>
            <a href={workspaceUrl}>
              Project workspace <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </div>

        <a className="vx-header-contact" href="#contact" onClick={closeMenu}>
          Let&apos;s Talk
        </a>
      </header>
    </>
  );
}
