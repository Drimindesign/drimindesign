import type { Metadata } from "next";
import { termsOfUse } from "@/content/legal";
import { LegalPage } from "@/features/legal";

export const metadata: Metadata = {
  title: termsOfUse.title,
  description: termsOfUse.description,
  alternates: { canonical: termsOfUse.path },
};

export default function Terms(): React.ReactElement {
  return <LegalPage document={termsOfUse} />;
}
