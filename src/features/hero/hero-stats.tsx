import type { CSSProperties } from "react";
import type { Stat } from "@/content/site";
import { cn } from "@/lib/utils/cn";

interface HeroStatsProps {
  stats: readonly Stat[];
  className?: string;
  style?: CSSProperties;
}

/* Number over label (visual order); the <dl> keeps term-then-description order for assistive tech. */
export function HeroStats({ stats, className, style }: HeroStatsProps): React.ReactElement {
  return (
    <dl className={cn("grid grid-cols-3 gap-4", className)} style={style}>
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-1.5 border-t border-border pt-3">
          <dt className="text-label font-medium text-fg">{stat.label}</dt>
          <dd className="order-first font-display text-stat text-fg-display tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
