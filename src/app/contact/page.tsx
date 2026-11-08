import type { Metadata } from "next";
import { footer } from "@/content/site";
import { ContactPage } from "@/features/contact";
import { contactPageSchema, JsonLd } from "@/lib/seo/json-ld";

const description =
  "Contact Drimindesign, a branding, website and app design agency in Pune, India. Tell us about your project and we'll reply personally within one working day.";

export const metadata: Metadata = {
  title: "Contact: Start a Branding, Website or App Project",
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
