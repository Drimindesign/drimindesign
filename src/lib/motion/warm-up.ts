import { afterIntro, whenIdle } from "./after-intro";

/*
 * Starts downloading a section's heavy code once the intro is over and the main thread is
 * idle, wherever the visitor is on the page, so it is already parsed when they scroll to it.
 * Loading still waits for the intro and idle time (AGENTS.md §5.2); mounting stays lazy.
 */
export function warmUp(load: () => Promise<unknown>): void {
  void afterIntro()
    .then(() => whenIdle(2500))
    .then(load)
    .catch(() => undefined);
}
