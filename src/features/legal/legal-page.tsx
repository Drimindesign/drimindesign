import Link from "next/link";
import { Fragment } from "react";
import type { LegalDocument } from "@/content/legal";
import { footer } from "@/content/site";
import styles from "./legal-page.module.css";

/* Phrases in the copy that become links: the studio inbox and the two documents. */
const LINKS: readonly { text: string; href: string }[] = [
  { text: footer.email, href: `mailto:${footer.email}` },
  { text: "Privacy Policy", href: "/privacy" },
  { text: "Terms of Use", href: "/terms" },
];
const PATTERN = new RegExp(`(${LINKS.map((link) => link.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);

function Linked({ text, self }: { text: string; self: string }): React.ReactElement {
  return (
    <>
      {text.split(PATTERN).map((part, index) => {
        const link = LINKS.find((item) => item.text === part);
        if (!link || link.href === self) return <Fragment key={index}>{part}</Fragment>;
        return link.href.startsWith("/") ? (
          <Link key={index} href={link.href} className={styles.link}>
            {part}
          </Link>
        ) : (
          <a key={index} href={link.href} className={styles.link}>
            {part}
          </a>
        );
      })}
    </>
  );
}

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

/*
 * A legal document (Privacy Policy, Terms of Use): a readable single column on the light
 * surface, numbered sections with a jump list beside them on wide screens. Server only.
 */
export function LegalPage({ document }: { document: LegalDocument }): React.ReactElement {
  const id = (index: number): string => `section-${index + 1}`;
  return (
    <main data-surface="light" className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className="text-label font-semibold tracking-[0.08em] text-brand-600 uppercase">Legal</p>
          <h1 className={`${styles.title} mt-4 font-semibold tracking-tight text-balance`}>{document.title}</h1>
          <p className="mt-4 text-body-sm font-medium text-ink-500">
            Last updated <time dateTime={document.updated}>{formatDate(document.updated)}</time>
          </p>
          <p className="mt-6 max-w-[60ch] text-body-lg text-ink-700">{document.intro}</p>
        </header>

        <div className={styles.layout}>
          <nav aria-label="On this page" className={styles.toc}>
            <ol>
              {document.sections.map((section, index) => (
                <li key={section.heading}>
                  <a href={`#${id(index)}`} className={styles.tocLink}>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.body}>
            {document.sections.map((section, index) => (
              <section key={section.heading} id={id(index)} aria-labelledby={`${id(index)}-title`} className={styles.section}>
                <h2 id={`${id(index)}-title`} className="text-heading-lg font-semibold tracking-tight">
                  <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span> {section.heading}
                </h2>
                <p>
                  <Linked text={section.paragraphs[0]} self={document.path} />
                </p>
                {section.list && (
                  <ul>
                    {section.list.map((item) => (
                      <li key={item}>
                        <Linked text={item} self={document.path} />
                      </li>
                    ))}
                  </ul>
                )}
                {section.paragraphs.slice(1).map((paragraph) => (
                  <p key={paragraph}>
                    <Linked text={paragraph} self={document.path} />
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
