import Link from "next/link";
import { contactCopy } from "@/content/contact";
import { InquiryForm } from "@/features/inquiry";
import styles from "./contact-page.module.css";

/*
 * The Contact page: on brand orange like the home page's inquiry, a large title, the
 * sentence form, and the studio's direct lines beside it. Server rendered; only the form
 * hydrates.
 */
export function ContactPage(): React.ReactElement {
  return (
    <main data-surface="orange" className={styles.page}>
      <div className={styles.inner}>
        <p className="text-label font-semibold tracking-[0.08em] uppercase">{contactCopy.eyebrow}</p>
        <h1 className={`${styles.title} mt-4 font-semibold tracking-tight text-balance`}>{contactCopy.title}</h1>
        <p className="mt-5 max-w-[46ch] text-body-lg">{contactCopy.intro}</p>

        <div className={styles.layout}>
          <section aria-labelledby="contact-form-title">
            <h2 id="contact-form-title" className="sr-only">
              {contactCopy.formTitle}
            </h2>
            <InquiryForm idPrefix="contact" />
          </section>

          <aside aria-label="Other ways to reach us" className={styles.aside}>
            <ul className={styles.channels}>
              {contactCopy.channels.map((channel) => (
                <li key={channel.label}>
                  {channel.href.startsWith("/") ? (
                    <Link href={channel.href} className={styles.channel}>
                      <span className={styles.label}>{channel.label}</span>
                      <span className={styles.value}>
                        {channel.value} <span aria-hidden="true">→</span>
                      </span>
                    </Link>
                  ) : (
                    <a href={channel.href} className={styles.channel}>
                      <span className={styles.label}>{channel.label}</span>
                      <span className={styles.value}>
                        {channel.value} <span aria-hidden="true">→</span>
                      </span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <dl className={styles.facts}>
              <div>
                <dt className={styles.label}>{contactCopy.hoursLabel}</dt>
                <dd>{contactCopy.hours}</dd>
              </div>
              <div>
                <dt className={styles.label}>{contactCopy.replyLabel}</dt>
                <dd>{contactCopy.reply}</dd>
              </div>
              <div>
                <dt className={styles.label}>{contactCopy.locationLabel}</dt>
                <dd>{contactCopy.location}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}
