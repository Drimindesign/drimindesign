import type { Metadata } from "next";
import { projectDetails } from "@/content/project-details";
import { projectImageUrl, projects } from "@/content/projects";
import { ProjectGrid } from "@/features/project-grid";
import { breadcrumbSchema, JsonLd } from "@/lib/seo/json-ld";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Selected brand identity, print and app design by Drimindesign: logos, stationery, signage and mobile apps made to feel physical and be remembered.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage(): React.ReactElement {
  const grid = projects.map((project) => ({
    slug: project.slug,
    title: project.title,
    category: project.category,
    alt: project.alt,
    disciplines: project.disciplines,
    year: projectDetails[project.slug].year,
    image: projectImageUrl(project, 1400),
  }));

  return (
    <main data-surface="light" className="px-[var(--gutter)] pt-[calc(var(--header-offset)+var(--control-height)+clamp(3rem,10svh,7rem))] pb-[clamp(4rem,10svh,7rem)]">
      <div className="mx-auto max-w-[var(--container-max)]">
        <p className="text-label font-semibold tracking-[0.08em] text-brand-600 uppercase">Selected work</p>
        <h1 className="mt-4 max-w-[14ch] text-[clamp(2.75rem,7vw,7rem)] leading-[0.95] font-semibold tracking-tight text-balance">
          Work that moves people.
        </h1>
        <p className="mt-6 mb-[clamp(2.5rem,7svh,4.5rem)] max-w-[46ch] text-body-lg text-pretty text-ink-600">
          Brand identities, print and apps for businesses that want to be remembered. Open any project for the full story.
        </p>
        <ProjectGrid projects={grid} />
      </div>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Projects", path: "/projects" },
        ])}
      />
    </main>
  );
}
