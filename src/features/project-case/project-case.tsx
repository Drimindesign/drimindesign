import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { projectDetails } from "@/content/project-details";
import { nextProject, projectImageUrl, projects, type Project } from "@/content/projects";
import { CaseSections } from "./case-sections";
import { ProjectClose } from "./project-close";
import styles from "./project-case.module.css";

/** Shared-element name: the Next project card morphs into this hero (React <ViewTransition>). */
export function heroTransitionName(slug: string): string {
  return `project-${slug}`;
}

/* Holds the hero's place while a project streams in (the route's shared navigation shell). */
export function ProjectCaseFallback(): React.ReactElement {
  return (
    <main>
      <div data-surface="dark" className={styles.hero} />
    </main>
  );
}

/*
 * A project's case study: a full-screen hero (exactly where the tissue pull lands), the facts,
 * a large intro line, the story in images and short chapters, and the next project. Server
 * rendered; motion is CSS only (scroll-driven reveals), so scrolling stays light.
 */
export function ProjectCase({ project }: { project: Project }): React.ReactElement {
  const detail = projectDetails[project.slug];
  const index = projects.indexOf(project);
  const next = nextProject(project.slug);

  return (
    <main>
      <section data-surface="dark" data-project-hero className={styles.hero} aria-labelledby="project-title">
        <ViewTransition name={heroTransitionName(project.slug)} share="morph" default="none">
          <div className={styles.heroImage}>
            <Image src={projectImageUrl(project, 1400)} alt={project.alt} fill preload sizes="100vw" />
          </div>
        </ViewTransition>
        <div className={styles.heroScrim} />
        <ProjectClose slug={project.slug} className={styles.close} />
        <div className={styles.heroCopy}>
          <p className="text-label font-medium tracking-[0.08em] text-white/80 uppercase tabular-nums">
            Case study · {String(index + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}
          </p>
          <h1 id="project-title" className={`${styles.title} mt-3 font-semibold tracking-tight text-balance text-white`}>
            {project.title}
          </h1>
          <p className="mt-3 text-body-lg font-medium text-white/85">{project.category}</p>
        </div>
      </section>

      <div data-surface="light" className={styles.body}>
        <dl className={styles.facts}>
          <div>
            <dt>Client</dt>
            <dd>{detail.client}</dd>
          </div>
          <div>
            <dt>Year</dt>
            <dd>{detail.year}</dd>
          </div>
          <div>
            <dt>Services</dt>
            <dd>{detail.services.join(", ")}</dd>
          </div>
          <div>
            <dt>Discipline</dt>
            <dd>{project.disciplines.join(" · ")}</dd>
          </div>
        </dl>

        <div className={styles.intro}>
          <p className={`${styles.reveal} text-heading-xl font-medium tracking-tight text-balance`}>{detail.intro}</p>
        </div>

        <CaseSections sections={detail.sections} />

        <Link href={`/projects/${next.slug}`} className={styles.next} aria-label={`Next project: ${next.title}`}>
          <span className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">Next project</span>
          <span className={`${styles.nextTitle} font-semibold tracking-tight`}>
            {next.title} <span aria-hidden="true">→</span>
          </span>
          <ViewTransition name={heroTransitionName(next.slug)} share="morph" default="none">
            <span className={styles.nextImage}>
              <Image src={projectImageUrl(next, 1400)} alt="" fill sizes="(min-width: 1760px) 1640px, 92vw" />
            </span>
          </ViewTransition>
        </Link>
      </div>
    </main>
  );
}
