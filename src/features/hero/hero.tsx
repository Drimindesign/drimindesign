import { hero, site } from "@/content/site";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { IntroStage, introItem } from "@/features/intro-reveal";
import { cn } from "@/lib/utils/cn";
import { CtaCard } from "./cta-card";
import { FallingWords } from "./falling-words";
import { HeroStats } from "./hero-stats";
import { Wordmark } from "./wordmark";

/*
 * Home hero. Brand top-left, giant wordmark across the top with the description right under
 * it, stats and CTA along the bottom. The section stays transparent so the white
 * frame shows while the intro panel expands; overflow-clip hides the panel's overhang.
 */
export function Hero(): React.ReactElement {
  const logo = introItem(1);
  const action = introItem(2);
  const description = introItem(3);
  const stats = introItem(4);
  const cta = introItem(5);

  return (
    <section data-surface="brand" aria-labelledby="hero-title" className="relative overflow-clip bg-transparent">
      <IntroStage className="px-[var(--gutter)] pt-[var(--header-offset)] pb-[var(--gutter)]">
        <div className="flex items-start justify-between">
          <Logo name={site.name} className={logo.className} style={logo.style} />
          <Button
            href={hero.primaryAction.href}
            variant="glass"
            className={cn("max-md:hidden", action.className)}
            style={action.style}
          >
            {hero.primaryAction.label}
          </Button>
        </div>

        {/* Spacing lives on a wrapper: the wordmark's own margins trim its line box. */}
        <div className="mt-[clamp(1.25rem,5svh,3.5rem)]">
          <Wordmark id="hero-title" name={site.name} word={hero.wordmark} widthEm={hero.wordmarkWidthEm} />
        </div>

        <FallingWords
          sentences={hero.sentences}
          floorSelector="[data-fall-floor]"
          className={cn(
            "mt-[clamp(1.25rem,3svh,2rem)] max-w-[34ch] lg:max-w-[44ch] text-body-lg font-medium text-pretty text-fg",
            description.className,
          )}
          style={description.style}
        />

        <div className="min-h-10 flex-1" />

        {/* data-fall-floor: falling words land on this row's top edge. */}
        <div data-fall-floor className="grid gap-x-6 gap-y-6 md:grid-cols-12 md:items-end">
          <HeroStats stats={hero.stats} className={cn("md:col-span-7 lg:col-span-5", stats.className)} style={stats.style} />
          <CtaCard
            {...hero.cta}
            className={cn("md:col-span-5 lg:col-span-4 lg:col-start-9", cta.className)}
            style={cta.style}
          />
        </div>
      </IntroStage>
    </section>
  );
}
