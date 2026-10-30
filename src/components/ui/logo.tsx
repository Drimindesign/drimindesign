import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import { BrandMark } from "./brand-mark";

interface LogoProps {
  name: string;
  className?: string;
  style?: CSSProperties;
}

/* Home link with the brand mark, in the surface's display colour (white on the brand purple and on dark). */
export function Logo({ name, className, style }: LogoProps): React.ReactElement {
  return (
    <Link
      href="/"
      className={cn("flex h-[var(--control-height)] items-center text-fg-display", className)}
      style={style}
    >
      <span className="sr-only">{name} home</span>
      <BrandMark className="h-9 w-auto sm:h-10" />
    </Link>
  );
}
