import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VertexaNavigation } from "@/components/vertexa/navigation";
import { VertexaSiteFooter } from "@/components/vertexa/site-footer";
import { RevealText } from "@/components/vertexa/reveal-text";
import {
  nextProject,
  projectBySlug,
  serviceLabel,
  vertexaProjects,
} from "@/lib/vertexa-projects";

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return vertexaProjects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = projectBySlug(slug);

  if (!project) {
    return { title: { absolute: "Page not found | Vertexa Group" } };
  }

  return {
    title: { absolute: `${project.title} | Vertexa Group` },
    description: project.summary,
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = projectBySlug(slug);

  if (!project) notFound();

  const next = nextProject(slug);

  return (
    <main className="vertexa">
      <a className="vx-skip-link" href="#main-content">
        Skip to content
      </a>

      <VertexaNavigation />

      <article className="vx-project-detail">
        <header className="vx-project-detail-intro" id="main-content">
          <p className="vx-projects-eyebrow">
            <span className="vx-projects-dot" aria-hidden="true" />
            {serviceLabel(project.service)}
          </p>
          <h1 className="vx-project-detail-title">
            <RevealText text={project.title} stagger={40} />
          </h1>
          <div className="vx-projects-rule" />
          <div className="vx-project-detail-meta">
            <span>{project.location}</span>
            <span>{project.year}</span>
          </div>
        </header>

        <figure className="vx-project-detail-hero">
          <span
            role="img"
            aria-label={project.alt}
            style={{ backgroundImage: `url('${project.image}')` }}
          />
        </figure>

        <section
          className="vx-project-detail-body"
          aria-labelledby="vx-project-detail-story-title"
        >
          <h2 className="vx-visually-hidden" id="vx-project-detail-story-title">
            About {project.title}
          </h2>

          <div className="vx-project-detail-grid">
            <div className="vx-project-detail-summary">
              <p className="vx-projects-eyebrow">
                <span className="vx-projects-dot" aria-hidden="true" />
                The project
              </p>
              <p className="vx-project-detail-lede">{project.summary}</p>

              <dl className="vx-project-detail-facts">
                <div>
                  <dt>Location</dt>
                  <dd>{project.location}</dd>
                </div>
                <div>
                  <dt>Year</dt>
                  <dd>{project.year}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{serviceLabel(project.service)}</dd>
                </div>
              </dl>
            </div>

            <div className="vx-project-detail-story">
              {project.story.map((paragraph) => (
                <p key={paragraph}>
                  <RevealText text={paragraph} stagger={5} />
                </p>
              ))}

              <ul className="vx-project-detail-scope">
                {project.scope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          className="vx-project-detail-gallery"
          aria-label={`${project.title} gallery`}
        >
          {project.gallery.map((item) => (
            <figure className="vx-project-detail-figure" key={item.image}>
              <span
                role="img"
                aria-label={item.alt}
                style={{ backgroundImage: `url('${item.image}')` }}
              />
            </figure>
          ))}
        </section>

        <nav className="vx-project-detail-next" aria-label="Project navigation">
          <Link className="vx-project-detail-back" href="/vertexa/projects">
            <span aria-hidden="true">←</span> All projects
          </Link>

          {next ? (
            <Link
              className="vx-project-detail-next-link"
              href={`/vertexa/projects/${next.slug}`}
            >
              <span className="vx-project-detail-next-label">Next project</span>
              <span className="vx-project-detail-next-title">
                {next.title} <span aria-hidden="true">↗</span>
              </span>
            </Link>
          ) : null}
        </nav>
      </article>

      <VertexaSiteFooter />
    </main>
  );
}
