import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Selected brand, web and motion work by Drimindesign — identities, websites and campaigns built to feel physical and be remembered.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage(): React.ReactElement {
  return <PagePlaceholder title="Projects" />;
}
