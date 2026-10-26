import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { projectDetails } from "@/content/project-details";
import { projectBySlug, projectImageUrl, projects } from "@/content/projects";
import { ProjectCase, ProjectCaseFallback } from "@/features/project-case";
import { breadcrumbSchema, creativeWorkSchema, JsonLd } from "@/lib/seo/json-ld";

export function generateStaticParams(): { slug: string }[] {
  return projects.map((project) => ({ slug: project.slug }));
}

/** 140–160 characters: the intro, with the client and year when there's room. */
function describe(slug: string): string {
  const detail = projectDetails[slug];
  const text = `${detail.intro} ${detail.services.join(", ")} for ${detail.client}, ${detail.year}.`;
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = projectBySlug(slug);
  if (!project) return {};
  const description = describe(slug);
  const image = projectImageUrl(project, 1400);
  return {
    title: project.title,
    description,
    alternates: { canonical: `/projects/${slug}` },
    openGraph: { type: "article", title: project.title, description, url: `/projects/${slug}`, images: [{ url: image, alt: project.alt }] },
    twitter: { card: "summary_large_image", title: project.title, description, images: [image] },
  };
}

/*
 * `params` is read under <Suspense> (instant navigation): every project is still prerendered
 * whole from generateStaticParams; the fallback only fills the route's shared navigation
 * shell, shaped like the hero so nothing moves when the project arrives.
 */
export default function ProjectPage({ params }: PageProps<"/projects/[slug]">): React.ReactElement {
  return (
    <Suspense fallback={<ProjectCaseFallback />}>
      <Project params={params} />
    </Suspense>
  );
}

async function Project({ params }: { params: PageProps<"/projects/[slug]">["params"] }): Promise<React.ReactElement> {
  const { slug } = await params;
  const project = projectBySlug(slug);
  if (!project) notFound();
  const detail = projectDetails[slug];

  return (
    <>
      <ProjectCase project={project} />
      <JsonLd
        data={creativeWorkSchema({
          name: project.title,
          description: describe(slug),
          url: `/projects/${slug}`,
          image: projectImageUrl(project, 1400),
          client: detail.client,
          year: detail.year,
          keywords: detail.services,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Projects", path: "/projects" },
          { name: project.title, path: `/projects/${slug}` },
        ])}
      />
    </>
  );
}
