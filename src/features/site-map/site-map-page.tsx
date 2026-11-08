import Link from "next/link";
import { projects } from "@/content/projects";
import { footer, navItems } from "@/content/site";
import styles from "./site-map-page.module.css";

interface Group {
  title: string;
  links: readonly { label: string; href: string; note?: string }[];
}

const groups: readonly Group[] = [
  { title: "Pages", links: [...navItems, { label: "Play Idea to Orbit", href: "/play" }] },
  {
    title: "Projects",
    links: projects.map((project) => ({ label: project.title, href: `/projects/${project.slug}`, note: project.category })),
  },
  { title: "Legal", links: footer.legal.filter((item) => item.href !== "/sitemap.html") },
];

/*
 * The HTML sitemap (linked in the footer): every page in plain links, grouped, so visitors and
 * crawlers can reach anything in one click. Built from the same content as the XML sitemap.
 */
export function SiteMapPage(): React.ReactElement {
  return (
    <main data-surface="light" className={styles.page}>
      <div className={styles.inner}>
        <p className="text-label font-semibold tracking-[0.08em] text-brand-600 uppercase">Sitemap</p>
        <h1 className={`${styles.title} mt-4 font-semibold tracking-tight`}>Every page on Drimindesign</h1>
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.title} aria-labelledby={`sitemap-${group.title}`}>
              <h2 id={`sitemap-${group.title}`} className={styles.heading}>
                {group.title}
              </h2>
              <ul className={styles.list}>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={styles.link}>
                      {link.label}
                    </Link>
                    {link.note && <span className={styles.note}>{link.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className={styles.xml}>
          For search engines: <a href="/sitemap.xml">sitemap.xml</a>
        </p>
      </div>
    </main>
  );
}
