import { Suspense } from "react";
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
      <Suspense fallback={null}><Hero /></Suspense>
      <Suspense fallback={null}><ProjectCylinder /></Suspense>
      <Suspense fallback={null}><StoryTree /></Suspense>
      <Suspense fallback={null}><AboutTeam /></Suspense>
      <Suspense fallback={null}><Inquiry /></Suspense>
    </main>
  );
}
