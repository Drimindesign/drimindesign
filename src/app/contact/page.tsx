import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Tell Drimindesign about your brand, website or motion project. Share a few details and the studio team will get back to you personally.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage(): React.ReactElement {
  return <PagePlaceholder title="Contact" />;
}
