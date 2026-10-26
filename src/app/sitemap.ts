import type { MetadataRoute } from "next";
import { navItems, site } from "@/content/site";

/* Static routes for now; project pages join this list in M3. */
export default function sitemap(): MetadataRoute.Sitemap {
  return navItems.map((item) => ({
    url: new URL(item.href, site.url).toString(),
    changeFrequency: "monthly",
    priority: item.href === "/" ? 1 : 0.7,
  }));
}
