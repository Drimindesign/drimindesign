"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DISCIPLINES, type Discipline } from "@/content/projects";
import { openProject, rectOutline } from "@/features/tissue-transition";
import styles from "./project-grid.module.css";

export interface GridProject {
  slug: string;
  title: string;
  category: string;
  alt: string;
  year: string;
  image: string;
  disciplines: readonly Discipline[];
}

interface ProjectGridProps {
  projects: readonly GridProject[];
}

/*
 * The Projects grid: filter chips and an editorial two-column grid (the second column sits
 * lower). Opening a card plays the same tissue pull as the ring: its top-right corner is
 * pinched up and the image spreads into the project's hero (features/tissue-transition),
 * and Close pulls it back into the card. Modified clicks open the link as usual.
 */
export function ProjectGrid({ projects }: ProjectGridProps): React.ReactElement {
  const [filter, setFilter] = useState<Discipline | "All">("All");
  const shown = filter === "All" ? projects : projects.filter((project) => project.disciplines.includes(filter));

  const pull = (project: GridProject) => (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const media = event.currentTarget.querySelector<HTMLElement>("[data-media]");
    if (!media) return;
    event.preventDefault();
    openProject({ slug: project.slug, image: project.image, from: "/projects", ...rectOutline(media.getBoundingClientRect()) });
  };

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Filter projects">
        {(["All", ...DISCIPLINES] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={styles.chip}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
        <p className="ml-auto text-label font-medium text-ink-500 tabular-nums" aria-live="polite">
          {String(shown.length).padStart(2, "0")} {shown.length === 1 ? "project" : "projects"}
        </p>
      </div>

      <ul className={styles.grid}>
        {shown.map((project) => (
          <li key={project.slug} className={styles.item}>
            <Link href={`/projects/${project.slug}`} className={styles.card} onClick={pull(project)}>
              <span className={styles.media} data-media>
                <Image src={project.image} alt={project.alt} fill sizes="(min-width: 768px) 46vw, 92vw" />
              </span>
              <span className={styles.meta}>
                <span className="text-heading-lg font-semibold tracking-tight">
                  {project.title} <span className={styles.arrow} aria-hidden="true">→</span>
                </span>
                <span className="text-body-sm font-medium text-ink-500">
                  {project.category} · {project.year}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
