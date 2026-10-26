"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, ViewTransition } from "react";
import { DISCIPLINES, type Discipline } from "@/content/projects";
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
 * lower). Each card's image shares its name with the project hero, so opening a project
 * morphs the card into the full-screen hero (React <ViewTransition>).
 */
export function ProjectGrid({ projects }: ProjectGridProps): React.ReactElement {
  const [filter, setFilter] = useState<Discipline | "All">("All");
  const shown = filter === "All" ? projects : projects.filter((project) => project.disciplines.includes(filter));

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
            <Link href={`/projects/${project.slug}`} className={styles.card}>
              <ViewTransition name={`project-${project.slug}`} share="morph" default="none">
                <span className={styles.media}>
                  <Image src={project.image} alt={project.alt} fill sizes="(min-width: 768px) 46vw, 92vw" />
                </span>
              </ViewTransition>
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
