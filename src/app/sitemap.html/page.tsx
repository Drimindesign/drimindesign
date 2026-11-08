import type { Metadata } from "next";
import { SiteMapPage } from "@/features/site-map";

export const metadata: Metadata = {
  title: "Sitemap",
  description:
    "Every page on the Drimindesign website in one place: branding, website and app design projects, contact, booking a call, the Idea to Orbit game and legal pages.",
  alternates: { canonical: "/sitemap.html" },
};

export default function SiteMap(): React.ReactElement {
  return <SiteMapPage />;
}
