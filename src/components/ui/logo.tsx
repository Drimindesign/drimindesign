import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import { BrandMark } from "./brand-mark";

interface LogoProps {
  name: string;
  className?: string;
  style?: CSSProperties;
}

/* Home link with the brand mark, in brand orange on neutral surfaces, ink on orange. */
export function Logo({ name, className, style }: LogoProps): React.ReactElement {
  return (
    <Link
      href="/"
      className={cn("flex h-[var(--control-height)] items-center text-accent", className)}
      style={style}
    >
      <span className="sr-only">{name} home</span>
      <BrandMark className="h-9 w-auto sm:h-10" />
    </Link>
  );
}
