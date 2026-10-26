import type { MetadataRoute } from "next";
import { projects } from "@/content/projects";
import { footer, navItems, site } from "@/content/site";

/* Static routes, every project page, and the legal pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = navItems.map((item) => ({
    url: new URL(item.href, site.url).toString(),
    changeFrequency: "monthly",
    priority: item.href === "/" ? 1 : 0.7,
  }));
  const work: MetadataRoute.Sitemap = projects.map((project) => ({
    url: new URL(`/projects/${project.slug}`, site.url).toString(),
    changeFrequency: "yearly",
    priority: 0.6,
  }));
  const legal: MetadataRoute.Sitemap = footer.legal.map((item) => ({
    url: new URL(item.href, site.url).toString(),
    changeFrequency: "yearly",
    priority: 0.2,
  }));
  return [...pages, ...work, ...legal];
}
