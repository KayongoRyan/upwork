import type { Metadata } from "next";
import Link from "next/link";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";

export const metadata: Metadata = {
  title: { absolute: "Page not found | Vertexa Group" },
};

export default function VertexaNotFound() {
  return (
    <main className="vertexa">
      <VertexaNavigation />

      <section className="vx-not-found" id="main-content">
        <p className="vx-projects-eyebrow">
          <span className="vx-projects-dot" aria-hidden="true" />
          404
        </p>
        <h1 className="vx-not-found-title">This page has moved on.</h1>
        <p className="vx-not-found-copy">
          The page you were looking for is no longer here. Return to the home
          page, or browse the project archive.
        </p>
        <div className="vx-not-found-links">
          <Link href="/vertexa">Back to home</Link>
          <Link href="/vertexa/projects">View projects</Link>
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
