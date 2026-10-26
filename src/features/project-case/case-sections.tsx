import type { CaseSection } from "@/content/project-details";
import { CaseImage } from "./case-image";
import styles from "./project-case.module.css";

const WIDE = "(min-width: 1760px) 1640px, 92vw";
const HALF = "(min-width: 768px) 46vw, 92vw";

function Caption({ text }: { text?: string }): React.ReactElement | null {
  return text ? <p className={`${styles.caption} text-body-sm text-ink-500`}>{text}</p> : null;
}

/* The story: images and short chapters in the order the content lists them. */
export function CaseSections({ sections }: { sections: readonly CaseSection[] }): React.ReactElement {
  // App case studies use their generated portrait photography on phones, not a cropped desktop screen strip.
  const mobilePair = sections.some((section) => section.kind === "screens")
    ? sections.find((section) => section.kind === "pair")
    : undefined;
  // Chapter numbers (01, 02…) counted over chapters only.
  const numbers = sections.map((_, index) => sections.slice(0, index + 1).filter((item) => item.kind === "chapter").length);
  return (
    <div className={styles.sections}>
      {sections.map((section, index) => {
        switch (section.kind) {
          case "wide":
            return (
              <figure key={index} className={styles.reveal}>
                <CaseImage image={section.image} sizes={WIDE} />
                <Caption text={section.caption} />
              </figure>
            );
          case "pair":
            return (
              <figure key={index} className={`${styles.reveal} ${section === mobilePair ? styles.desktopOnly : ""}`}>
                <div className={styles.pair}>
                  <CaseImage image={section.images[0]} sizes={HALF} />
                  <CaseImage image={section.images[1]} sizes={HALF} className={styles.pairOffset} />
                </div>
                <Caption text={section.caption} />
              </figure>
            );
          case "screens":
            return (
              <div key={index}>
                <figure className={`${styles.reveal} ${mobilePair ? styles.desktopOnly : ""}`}>
                  <div className={styles.screens}>
                    {section.images.map((image) => (
                      <CaseImage key={image.src} image={image} sizes="(min-width: 768px) 18vw, 62vw" className={styles.screen} />
                    ))}
                  </div>
                  <Caption text={section.caption} />
                </figure>
                {mobilePair && (
                  <figure className={`${styles.mobileOnly} ${styles.reveal}`}>
                    <div className={styles.pair}>
                      <CaseImage image={mobilePair.images[0]} sizes={WIDE} />
                      <CaseImage image={mobilePair.images[1]} sizes={WIDE} />
                    </div>
                    <Caption text={mobilePair.caption} />
                  </figure>
                )}
              </div>
            );
          case "chapter":
            return (
              <section key={index} className={`${styles.chapter} ${styles.reveal}`} aria-label={section.title}>
                <p className="text-label font-semibold tracking-[0.08em] text-orange-600 uppercase tabular-nums">
                  {String(numbers[index]).padStart(2, "0")} · {section.title}
                </p>
                <p className="text-heading-md font-medium text-pretty text-ink-900">{section.body}</p>
              </section>
            );
        }
      })}
    </div>
  );
}
