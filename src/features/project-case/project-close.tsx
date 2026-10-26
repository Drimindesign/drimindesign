"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { originSlug, tissue } from "@/features/tissue-transition";
import { Button } from "@/components/ui/button";

interface ProjectCloseProps {
  slug: string;
  className?: string;
}

const serverSnapshot = (): null => null;

/*
 * Arrived through the ring: "Close" goes back, and the tissue pull plays in reverse into the
 * panel. Arrived any other way (a link, a search result): "All work" opens the Projects page.
 */
export function ProjectClose({ slug, className }: ProjectCloseProps): React.ReactElement {
  const router = useRouter();
  const fromRing = useSyncExternalStore(tissue.subscribe, originSlug, serverSnapshot) === slug;

  if (fromRing) {
    return (
      <Button variant="glass" size="md" className={className} onClick={() => router.back()}>
        <span aria-hidden="true">←</span> Close
      </Button>
    );
  }
  return (
    <Button href="/projects" variant="glass" size="md" className={className}>
      <span aria-hidden="true">←</span> All work
    </Button>
  );
}
