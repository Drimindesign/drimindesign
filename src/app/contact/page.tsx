import type { Metadata } from "next";
import { footer } from "@/content/site";
import { ContactPage } from "@/features/contact";
import { contactPageSchema, JsonLd } from "@/lib/seo/json-ld";

const description =
  "Tell Drimindesign about your brand, website or motion project. Share a few details and the studio team will get back to you personally.";

export const metadata: Metadata = {
  title: "Contact",
  description,
  alternates: { canonical: "/contact" },
};

export default function Contact(): React.ReactElement {
  return (
    <>
      <ContactPage />
      <JsonLd data={contactPageSchema({ path: "/contact", description, email: footer.email })} />
    </>
  );
}
