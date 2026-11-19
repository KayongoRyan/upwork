export type VertexaServiceId = "custom-homes" | "renovations" | "extensions";

export type VertexaProjectImage = {
  image: string;
  alt: string;
};

export type VertexaProject = {
  slug: string;
  title: string;
  year: string;
  location: string;
  service: VertexaServiceId;
  image: string;
  alt: string;
  summary: string;
  story: string[];
  scope: string[];
  gallery: VertexaProjectImage[];
};

export const vertexaServices = [
  { id: "custom-homes", label: "Custom Home Construction" },
  { id: "renovations", label: "Home Renovations" },
  { id: "extensions", label: "Home Extensions" },
] as const satisfies ReadonlyArray<{ id: VertexaServiceId; label: string }>;

export const vertexaProjects: VertexaProject[] = [
  {
    slug: "calibre",
    title: "Calibre",
    year: "2025",
    location: "Kacyiru, Kigali",
    service: "custom-homes",
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=88",
    alt: "Light-filled contemporary living room opening onto a garden",
    summary:
      "A quiet composition of stone, timber and glass on a hillside plot in Kacyiru.",
    story: [
      "Calibre began with a simple brief: a family home that would feel settled the moment the front door closed. Working alongside Sketch Design Rwanda, we shaped the plan around a courtyard that catches the afternoon light, letting it travel deep into the centre of the house while keeping the street elevation restrained.",
      "The material palette is deliberately narrow — honed limestone, quarter-sawn oak and hand-finished plaster — so that texture, rather than colour, does the talking. Every junction was resolved on site with the architect, which is where the calm of the finished rooms really comes from.",
    ],
    scope: [
      "Architectural custom home",
      "Central courtyard",
      "Bespoke kitchen",
      "Interior joinery",
    ],
    gallery: [
      {
        image:
          "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=88",
        alt: "Warm timber and stone kitchen with a long island bench",
      },
      {
        image:
          "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=1400&q=88",
        alt: "Crafted kitchen joinery with integrated appliances",
      },
    ],
  },
  {
    slug: "aveline-house",
    title: "Aveline House",
    year: "2025",
    location: "Rebero, Kigali",
    service: "custom-homes",
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=88",
    alt: "Warm timber and stone kitchen in a new custom home",
    summary:
      "A family home on the Rebero ridge organised around a long kitchen and a garden that runs to the fence line.",
    story: [
      "Aveline House sits on a wide Rebero plot where the garden is as important as the building. We arranged the home around a long kitchen and living spine, opening it to the valley views with deep eaves that temper the midday sun.",
      "Timber, stone and a restrained white palette carry from the entry through to the back garden. The detail work — shadow lines, flush thresholds, concealed storage — was drawn early and protected throughout the build.",
    ],
    scope: [
      "New custom home",
      "Kitchen and living spine",
      "Landscape integration",
      "Concealed storage",
    ],
    gallery: [
      {
        image:
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=88",
        alt: "Contemporary home exterior framed by established gardens",
      },
      {
        image:
          "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1400&q=88",
        alt: "Considered interior with soft furnishings and natural light",
      },
    ],
  },
  {
    slug: "northcote-terrace",
    title: "Northcote Terrace",
    year: "2024",
    location: "Kimihurura, Kigali",
    service: "renovations",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=88",
    alt: "Renovated terrace interior with original details and modern joinery",
    summary:
      "A character home in Kimihurura reworked behind its original street façade.",
    story: [
      "Northcote Terrace had good bones and a difficult plan: dark rooms, a lean-to at the rear, and a garden cut off from the house. Our work began at the back, replacing the addition with a light-filled living wing that steps down to the garden.",
      "Original cornices, archways and timber floors were repaired rather than replaced. New joinery picks up the same profiles in a contemporary language, so the old and new parts of the house read as one.",
    ],
    scope: [
      "Heritage renovation",
      "Rear living wing",
      "Original detail restoration",
      "Custom joinery",
    ],
    gallery: [
      {
        image:
          "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=1400&q=88",
        alt: "Kitchen joinery blending heritage proportions with modern detailing",
      },
      {
        image:
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=88",
        alt: "Warm interior detail with natural stone and filtered light",
      },
    ],
  },
  {
    slug: "elm-and-stone",
    title: "Elm & Stone",
    year: "2024",
    location: "Remera, Kigali",
    service: "renovations",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=88",
    alt: "Considered renovation with stone surfaces and soft natural light",
    summary:
      "A measured renovation that opens a Remera home to its garden.",
    story: [
      "Elm & Stone was a renovation of restraint. The clients loved the proportions of the existing rooms but wanted the house to breathe — more light, fewer walls, a better connection to the garden.",
      "We removed a central corridor, widened two openings and rebuilt the kitchen in stone and elm veneer. Services were upgraded throughout so the visible work could stay quiet and the house could perform properly for another generation.",
    ],
    scope: [
      "Full interior renovation",
      "Kitchen and living",
      "Structural alterations",
      "Services upgrade",
    ],
    gallery: [
      {
        image:
          "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1400&q=88",
        alt: "Refined bathroom detail with brushed tapware",
      },
      {
        image:
          "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=1400&q=88",
        alt: "Stone and timber kitchen with soft natural light",
      },
    ],
  },
  {
    slug: "the-courtyard",
    title: "The Courtyard",
    year: "2023",
    location: "Nyarutarama, Kigali",
    service: "extensions",
    image:
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=88",
    alt: "Glass-walled extension opening onto a private courtyard",
    summary:
      "A glass-walled extension wrapped around a private courtyard in Nyarutarama.",
    story: [
      "The Courtyard adds a new living and dining room to a 1970s Nyarutarama residence, arranged around a walled garden rather than out toward the street. Glazing runs the full length of the addition, framed in slim steel so the garden reads as part of the interior.",
      "A timber-lined ceiling lifts the roofline and softens the acoustics. The junction between old brick and new steel was the most carefully detailed part of the project, and it is the part visitors notice first.",
    ],
    scope: [
      "Rear extension",
      "Steel-framed glazing",
      "Courtyard garden",
      "New living and dining",
    ],
    gallery: [
      {
        image:
          "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88",
        alt: "Open living space with timber floors and garden outlook",
      },
      {
        image:
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=88",
        alt: "Living room opening onto a private courtyard",
      },
    ],
  },
  {
    slug: "garden-pavilion",
    title: "Garden Pavilion",
    year: "2023",
    location: "Gisozi, Kigali",
    service: "extensions",
    image:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88",
    alt: "Garden pavilion extension with timber ceilings and full-height glazing",
    summary:
      "A pavilion extension that gives a Gisozi home a second living room in the garden.",
    story: [
      "Garden Pavilion was conceived as a room in the garden rather than an addition to the house. Set slightly apart from the original building, it is linked by a glazed passage that frames a view of the lawn on arrival.",
      "The pavilion is built in timber and glass, with a deep timber ceiling and polished concrete floors. It works equally well as a studio, a guest room or a place to sit with the doors open.",
    ],
    scope: [
      "Detached pavilion",
      "Glazed link",
      "Timber ceiling",
      "Polished concrete floors",
    ],
    gallery: [
      {
        image:
          "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=88",
        alt: "Interior of a garden pavilion with timber ceilings",
      },
      {
        image:
          "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1400&q=88",
        alt: "Softly furnished garden room with full-height glazing",
      },
    ],
  },
];

export function serviceLabel(id: VertexaServiceId) {
  return vertexaServices.find((service) => service.id === id)?.label ?? id;
}

export function projectsForService(service?: string) {
  if (!service) return vertexaProjects;
  return vertexaProjects.filter((project) => project.service === service);
}

export function isVertexaServiceId(value?: string): value is VertexaServiceId {
  return vertexaServices.some((service) => service.id === value);
}

export function projectBySlug(slug: string) {
  return vertexaProjects.find((project) => project.slug === slug);
}

export function nextProject(slug: string) {
  const index = vertexaProjects.findIndex((project) => project.slug === slug);
  if (index === -1) return undefined;
  return vertexaProjects[(index + 1) % vertexaProjects.length];
}