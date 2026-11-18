import {
  VertexaCollaboratorsCarousel,
  type VertexaCollaboratorSlide,
} from "@/components/vertexa/collaborators-carousel";

const collaborators = [
  { name: "Cumulus Studio", role: "Award winning architecture" },
  { name: "Sussex", role: "Australian leading tapware" },
  { name: "Sketch Design & Interiors", role: "Architects" },
  { name: "Miele", role: "Premium appliances" },
  { name: "Bespoke", role: "Windows and doors" },
];

const carouselSlides: VertexaCollaboratorSlide[] = [
  {
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=86",
    alt: "Architectural timber joinery and stone kitchen detail",
    caption: "In close partnership with Cumulus Studio",
  },
  {
    image:
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1400&q=86",
    alt: "Refined bathroom detail with brushed tapware",
    caption: "Beautiful tapware by Sussex Taps",
  },
  {
    image:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1400&q=86",
    alt: "Considered interior with soft furnishings and natural light",
    caption: "Award-winning interiors by Sketch Design",
  },
  {
    image:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1400&q=86",
    alt: "Contemporary kitchen with integrated premium appliances",
    caption: "Finishing touches added with Miele",
  },
  {
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=86",
    alt: "Full-height sliding doors opening a living room to the garden",
    caption: "High-end windows and doors by Bespoke",
  },
];

type VertexaCollaboratorsSectionProps = {
  /**
   * Renders the label at editorial scale (small caps with a dot) instead of
   * the large display heading used on the About page.
   */
  compactTitle?: boolean;
};

export function VertexaCollaboratorsSection({
  compactTitle = false,
}: VertexaCollaboratorsSectionProps) {
  return (
    <section
      className="vx-about-collaborators"
      id="collaborators"
      aria-labelledby="vx-about-collaborators-title"
    >
      <div className="vx-about-collaborators-grid">
        <div className="vx-about-collaborators-info">
          <h2
            className={
              compactTitle
                ? "vx-about-collaborators-title vx-about-collaborators-title-label"
                : "vx-about-collaborators-title"
            }
            id="vx-about-collaborators-title"
          >
            <span
              className={
                compactTitle
                  ? "vx-about-dot"
                  : "vx-about-collaborators-dot"
              }
              aria-hidden="true"
            />
            Our collaborators
          </h2>
          <div className="vx-about-collaborators-divider" />
          <p className="vx-about-collaborators-copy">
            Vertexa partners with leading architects and designers to realise
            ideas with integrity and precision. Our relationships are built on
            trust, detail, and shared respect for design.
          </p>
          <div className="vx-about-collaborators-list">
            {collaborators.map((collaborator) => (
              <div
                className="vx-about-collaborators-item"
                key={collaborator.name}
              >
                <span className="vx-about-collaborators-name">
                  {collaborator.name}
                </span>
                <span className="vx-about-collaborators-role">
                  {collaborator.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        <VertexaCollaboratorsCarousel slides={carouselSlides} />
      </div>
    </section>
  );
}
