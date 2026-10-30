import { projectBySlug, projectImageUrl } from "@/content/projects";
import { GameMount, type Reward } from "./game-mount";
import styles from "./orbit.module.css";
import type { StageId } from "./stages/types";

/* The project each stage unlocks: discovering an identity, building a place, launching an app, growing a learner. */
const STAGE_REWARDS: Partial<Record<StageId, string>> = {
  discover: "breeze-and-mist",
  build: "breeze-and-grains",
  launch: "shreeram-milks",
  grow: "speakora-onboarding",
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
        Take an idea from a forest at dawn to the Moon in four stages: find the sparks on foot, drive out of the
        forest and through the city, launch into orbit, and plant the flag. Arrow keys move, Space jumps or fires the
        thrusters, E gets in and out of the car.
      </p>
      <GameMount rewards={rewards} />
    </main>
  );
}
