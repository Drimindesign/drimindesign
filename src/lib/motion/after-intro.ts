/*
 * Gates for enhancements that must not compete with the intro: wait until
 * html[data-intro] leaves "play", then until the main thread is idle.
 */

export function afterIntro(): Promise<void> {
  const root = document.documentElement;
  if (root.dataset.intro !== "play") return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (root.dataset.intro !== "play") {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-intro"] });
  });
}

export function whenIdle(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: timeoutMs });
    else setTimeout(resolve, 200);
  });
}
