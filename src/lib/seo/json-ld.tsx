import { footer, site } from "@/content/site";

type JsonLdObject = Record<string, unknown>;

/*
 * Renders structured data. `<` is escaped so content can never close the script tag.
 * See node_modules/next/dist/docs/01-app/02-guides/json-ld.md
 */
export function JsonLd({ data }: { data: JsonLdObject }): React.ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function organizationSchema(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    alternateName: ["Drimin Design", "Drimin Designs", "Drimindesigns"],
    url: site.url,
    logo: new URL("/icon-512.png", site.url).toString(),
    description: site.description,
    email: footer.email,
    foundingDate: "2023",
    address: {
      "@type": "PostalAddress",
      addressLocality: site.location.city,
      addressRegion: site.location.region,
      addressCountry: site.location.country,
    },
    areaServed: [{ "@type": "City", name: site.location.city }, { "@type": "Country", name: "India" }, "Worldwide"],
    knowsAbout: site.services,
    contactPoint: { "@type": "ContactPoint", contactType: "sales", email: footer.email, availableLanguage: ["English", "Hindi"] },
  };
}

export function websiteSchema(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
  };
}

export function creativeWorkSchema(work: { name: string; description: string; url: string; image: string; client: string; year: string; keywords: readonly string[] }): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: work.name,
    description: work.description,
    url: new URL(work.url, site.url).toString(),
    image: new URL(work.image, site.url).toString(),
    dateCreated: work.year,
    keywords: work.keywords.join(", "),
    creator: { "@type": "Organization", name: site.name, url: site.url },
    sourceOrganization: { "@type": "Organization", name: work.client },
  };
}

export function contactPageSchema(page: { path: string; description: string; email: string }): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    url: new URL(page.path, site.url).toString(),
    description: page.description,
    mainEntity: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
      email: page.email,
      contactPoint: { "@type": "ContactPoint", contactType: "customer service", email: page.email },
    },
  };
}

export function breadcrumbSchema(items: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, site.url).toString(),
    })),
  };
}
