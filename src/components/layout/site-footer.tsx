import { cacheLife } from "next/cache";
import Link from "next/link";
import { footer, hero, navItems, site } from "@/content/site";
import { Button } from "@/components/ui/button";
import { BendingWord } from "@/features/hero";
import styles from "./site-footer.module.css";

/* The year, cached for a day: Cache Components keeps `new Date()` out of the static shell. */
async function CopyrightYear(): Promise<React.ReactElement> {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

/*
 * Site-wide footer on ink: a last call to action, the links, and the DRIMIN wordmark again
 * at full width, still bending under the cursor, so every page ends where the home began.
 */
export function SiteFooter(): React.ReactElement {
  return (
    <footer data-surface="dark" className={styles.footer}>
      <div className={styles.top}>
        <div>
          <p className="text-label font-semibold tracking-[0.08em] text-orange-500 uppercase">{footer.eyebrow}</p>
          <p className="mt-4 text-heading-xl font-semibold tracking-tight text-balance">{footer.title}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button href={footer.action.href} size="lg">
              {footer.action.label}
            </Button>
            <a href={`mailto:${footer.email}`} className={`${styles.link} text-body-lg font-medium`}>
              {footer.email}
            </a>
          </div>
        </div>

        <nav aria-label="Footer" className={styles.columns}>
          <div>
            <p className="text-label font-medium tracking-[0.08em] text-white/60 uppercase">{footer.navTitle}</p>
            <ul className="mt-4 space-y-2">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={`${styles.link} text-body-lg font-medium`}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-label font-medium tracking-[0.08em] text-white/60 uppercase">{footer.contactTitle}</p>
            <ul className="mt-4 space-y-2">
              <li>
                <a href={`mailto:${footer.email}`} className={`${styles.link} text-body-lg font-medium`}>
                  Email
                </a>
              </li>
              <li>
                <Link href="/contact" className={`${styles.link} text-body-lg font-medium`}>
                  Contact form
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className={styles.word}>
        <BendingWord word={hero.wordmark} widthEm={hero.wordmarkWidthEm} />
      </div>

      <div className={styles.bottom}>
        <p>
          © <CopyrightYear /> {site.name}. {site.tagline}.
        </p>
        <a href="#top" className={styles.link}>
          {footer.backToTop} ↑
        </a>
      </div>
    </footer>
  );
}
