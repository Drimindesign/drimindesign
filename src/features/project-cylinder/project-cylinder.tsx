import Link from "next/link";
import type { CSSProperties } from "react";
import { projects } from "@/content/projects";
import { sectionHeightVh, snapOffsetsVh } from "./choreography";
import { CylinderStage } from "./cylinder-stage";
import styles from "./project-cylinder.module.css";

/*
 * Section 2: selected work on a thin ring of panels in an endless hazy room. The section is
 * tall (one pinned screen plus the scroll the choreography needs); the stage is sticky.
 * Project names are also real text here for search engines and screen readers.
 */
export function ProjectCylinder(): React.ReactElement {
  const height = sectionHeightVh(projects.length);

  return (
    <section
      id="work"
      data-surface="orange"
      aria-labelledby="work-title"
      className={styles.section}
      style={{ height: `${height * 100}svh` } as CSSProperties}
    >
      {/* Snap markers: the landing, and wherever each project faces the camera. */}
      {snapOffsetsVh(projects.length).map((offset) => (
        <span key={offset} data-snap aria-hidden="true" className={styles.snap} style={{ top: `${offset * 100}svh` }} />
      ))}

      <CylinderStage projects={projects} />

      <div className="sr-only">
        <h2 id="work-title">Selected work</h2>
        <ol>
          {projects.map((project) => (
            <li key={project.slug}>
              <Link href={`/projects/${project.slug}`}>
                {project.title}: {project.category}
              </Link>
              . {project.alt}.
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
