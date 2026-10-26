import { inquiryCopy } from "@/content/inquiry";
import styles from "./inquiry.module.css";
import { InquiryForm } from "./inquiry-form";

/* Section 5: the inquiry, on brand orange to bookend the page with the hero. */
export function Inquiry(): React.ReactElement {
  return (
    <section id="inquiry" data-surface="orange" aria-labelledby="inquiry-title" className={styles.section}>
      <div className={styles.inner}>
        <p className="text-label font-semibold tracking-[0.08em] uppercase">{inquiryCopy.eyebrow}</p>
        <h2 id="inquiry-title" className="mt-4 max-w-[20ch] text-heading-xl font-semibold tracking-tight text-balance">
          {inquiryCopy.title}
        </h2>
        <p className="mt-4 text-body-lg">{inquiryCopy.body}</p>
        <InquiryForm />
      </div>
    </section>
  );
}
