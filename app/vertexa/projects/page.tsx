import type { Metadata } from "next";
import Link from "next/link";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { vertexaAwards } from "@/lib/vertexa-awards";
import {
  isVertexaServiceId,
  projectsForService,
  serviceLabel,
  vertexaServices,
} from "@/lib/vertexa-projects";

export const metadata: Metadata = {
  title: { absolute: "Projects | Vertexa Group" },
  description:
    "A considered collection of custom homes, renovations and extensions shaped around the people who live in them.",
};

type ProjectsPageProps = {
  searchParams: Promise<{ service?: string | string[] }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const resolved = await searchParams;
  const rawService = Array.isArray(resolved.service)
    ? resolved.service[0]
    : resolved.service;
  const activeService = isVertexaServiceId(rawService) ? rawService : undefined;
  const projects = projectsForService(activeService);

  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <section className="vx-projects-intro" id="main-content">
        <h1>Our projects</h1>
        <div className="vx-projects-rule" />
        <div className="vx-projects-intro-grid">
          <p className="vx-projects-eyebrow">
            <span className="vx-projects-dot" aria-hidden="true" />
            Considered craft
          </p>
          <p className="vx-projects-lede">
            Vertexa belongs among the country&apos;s leading architectural and
            design practices. We build for clients who value refinement, not
            repetition. Every home we create is a direct response to the people
            who will live in it: their routines, their aspirations, and the way
            they want to live.
          </p>
        </div>
      </section>

      <section className="vx-projects-archive" aria-labelledby="vx-projects-archive-title">
        <h2 className="vx-visually-hidden" id="vx-projects-archive-title">
          Project archive
        </h2>

        <nav className="vx-projects-filters" aria-label="Filter projects">
          <Link
            className="vx-projects-filter"
            href="/vertexa/projects"
            aria-current={activeService ? undefined : "page"}
          >
            All projects
          </Link>
          {vertexaServices.map((service) => (
            <Link
              key={service.id}
              className="vx-projects-filter"
              href={`/vertexa/projects?service=${service.id}`}
              aria-current={activeService === service.id ? "page" : undefined}
            >
              {service.label}
            </Link>
          ))}
        </nav>

        {projects.length > 0 ? (
          <div className="vx-projects-grid">
            {projects.map((project) => (
              <article className="vx-project-card" key={project.slug}>
                <Link
                  className="vx-project-card-link"
                  href={`/vertexa/projects/${project.slug}`}
                  aria-label={`View ${project.title}, ${project.location}`}
                >
                  <span
                    className="vx-project-card-media"
                    role="img"
                    aria-label={project.alt}
                    style={{ backgroundImage: `url('${project.image}')` }}
                  />
                  <span className="vx-project-card-body">
                    <span className="vx-project-card-title">{project.title}</span>
                    <span className="vx-project-card-meta">
                      <span>{project.location}</span>
                      <span>{project.year}</span>
                    </span>
                    <span className="vx-project-card-service">
                      {serviceLabel(project.service)}
                    </span>
                  </span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="vx-projects-empty">
            No projects in this collection yet.{" "}
            <Link href="/vertexa/projects">View all projects</Link>.
          </p>
        )}
      </section>

      <section className="vx-projects-awards" aria-labelledby="vx-projects-awards-title">
        <h2 className="vx-projects-section-title" id="vx-projects-awards-title">
          <span className="vx-projects-dot" aria-hidden="true" />
          Awards
        </h2>
        <div className="vx-awards-list">
          {vertexaAwards.map((award) => (
            <div className="vx-award" key={`${award.organisation}-${award.award}`}>
              <span className="vx-award-organisation">{award.organisation}</span>
              <span className="vx-award-name">{award.award}</span>
              <span className="vx-award-year">&rsquo;{award.year}</span>
            </div>
          ))}
        </div>
      </section>

      <VertexaSiteFooter />
    </main>
  );
}
