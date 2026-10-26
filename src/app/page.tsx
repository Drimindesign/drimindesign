import type { Metadata } from "next";
import { AboutTeam } from "@/features/about-team";
import { Hero } from "@/features/hero";
import { Inquiry } from "@/features/inquiry";
import { ProjectCylinder } from "@/features/project-cylinder";
import { StoryTree } from "@/features/story-tree";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage(): React.ReactElement {
  return (
    <main>
      <Hero />
      <ProjectCylinder />
      <StoryTree />
      <AboutTeam />
      <Inquiry />
    </main>
  );
}
