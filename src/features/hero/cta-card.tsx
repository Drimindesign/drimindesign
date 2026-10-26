import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";

interface CtaCardProps {
  eyebrow: string;
  label: string;
  href: string;
  className?: string;
  style?: CSSProperties;
}

/* Liquid-glass card floating on the hero; the arrow nudges toward its target on hover. */
export function CtaCard({ eyebrow, label, href, className, style }: CtaCardProps): React.ReactElement {
  return (
    <Link
      href={href}
      className={cn(
        "liquid-glass group flex items-end justify-between gap-6 rounded-lg p-5 transition-[translate,filter] duration-200 ease-standard active:translate-y-px pointer-fine:hover:brightness-110 lg:p-6",
        className,
      )}
      style={style}
    >
      <span className="flex flex-col gap-2">
        <span className="text-label font-medium text-glass-fg-muted">{eyebrow}</span>
        <span className="text-heading-md font-semibold">{label}</span>
      </span>
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-pill bg-glass-active text-glass-active-fg shadow-[var(--inset-raise-dark)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        >
          <path d="M7 17 17 7M8 7h9v9" />
        </svg>
      </span>
    </Link>
  );
}
