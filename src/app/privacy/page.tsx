import type { Metadata } from "next";
import { privacyPolicy } from "@/content/legal";
import { LegalPage } from "@/features/legal";

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.description,
  alternates: { canonical: privacyPolicy.path },
};

export default function Privacy(): React.ReactElement {
  return <LegalPage document={privacyPolicy} />;
}
