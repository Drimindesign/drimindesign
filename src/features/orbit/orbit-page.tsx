import { projectBySlug, projectImageUrl } from "@/content/projects";
import { GameMount, type Reward } from "./game-mount";
import styles from "./orbit.module.css";
import type { StageId } from "./stages/types";

/* The project each stage unlocks: discovering an identity, building a place, launching an app, growing a learner. */
const STAGE_REWARDS: Partial<Record<StageId, string>> = {
  village: "breeze-and-mist",
  jungle: "tulsi",
  city: "breeze-and-grains",
  forest: "shreeram-milks",
};

/*
 * /play: Idea to Orbit fills the screen. The real heading and a description are text for
 * search engines and screen readers; the game itself is a canvas.
 */
export function OrbitPage(): React.ReactElement {
  const rewards: Reward[] = (Object.entries(STAGE_REWARDS) as [StageId, string][]).flatMap(([stage, slug]) => {
    const project = projectBySlug(slug);
    return project ? [{ stage, slug, title: project.title, category: project.category, image: projectImageUrl(project, 700) }] : [];
  });

  return (
    <main data-surface="dark" className={styles.page} data-lenis-prevent="">
      <h1 className="sr-only">Idea to Orbit, a game by Drimindesign</h1>
      <p className="sr-only">
        Carry the Spark, a big idea, to the launch pad before Mr. Grey&apos;s Copycats steal it: out of a monsoon village,
        across a night jungle on foot, through the city and up the last road to the launch. Arrow keys move, Space
        jumps or fires the thrusters, F swings the sword, E gets in and out of the truck.
      </p>
      <GameMount rewards={rewards} />
    </main>
  );
}
