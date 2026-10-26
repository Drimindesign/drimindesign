import { navItems, hero } from "@/content/site";
import { introItem } from "@/features/intro-reveal";
import { cn } from "@/lib/utils/cn";
import { HeaderSurface } from "./header-surface";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";

/*
 * Fixed, site-wide navigation: a glass pill on md+, a menu button on small screens.
 * The bar itself ignores the pointer so it never blocks the page behind its gaps.
 */
export function SiteHeader(): React.ReactElement {
  const desktop = introItem(0, "drop");
  const mobile = introItem(0, "drop");

  return (
    // bg-transparent: HeaderSurface sets data-surface here for the glass tokens only.
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[var(--z-nav)] flex justify-center bg-transparent px-[var(--gutter)] pt-[var(--header-offset)]">
      <HeaderSurface />
      <nav
        aria-label="Primary"
        className={cn(
          "liquid-glass pointer-events-auto hidden h-[var(--control-height)] items-center rounded-pill p-1 md:flex",
          desktop.className,
        )}
        style={desktop.style}
      >
        <NavLinks items={navItems} />
      </nav>

      <div className="pointer-events-auto absolute right-[var(--gutter)] md:hidden">
        <MobileMenu
          items={navItems}
          action={hero.primaryAction}
          triggerClassName={mobile.className}
          triggerStyle={mobile.style}
        />
      </div>
    </header>
  );
}
