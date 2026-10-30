"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { NavItem } from "@/content/site";
import { Button } from "@/components/ui/button";
import styles from "./mobile-menu.module.css";

interface MobileMenuProps {
  items: readonly NavItem[];
  action: NavItem;
  /* Applied to the trigger itself (not a wrapper): an animated-opacity ancestor would cut
     the glass off from the page behind it while the intro runs. */
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}

/** The squeeze's release (--duration-slower), after which html[data-menu] is cleared. */
const RELEASE_MS = 820;

/*
 * Pins the page's squeeze to what is on screen: the page scales about the viewport's centre
 * and is clipped to the viewport's rectangle (so it reads as one card being pressed back).
 * Values are in the page's own coordinates; globals.css applies them while html[data-menu].
 */
function holdPage(): HTMLElement | null {
  // The page wrapper (root layout): every route's <main> and the footer.
  const page = document.querySelector<HTMLElement>("[data-page]");
  if (!page) return null;
  const rect = page.getBoundingClientRect();
  const top = Math.max(0, -rect.top);
  const root = document.documentElement.style;
  root.setProperty("--menu-origin-y", `${top + window.innerHeight / 2}px`);
  root.setProperty("--menu-clip-top", `${top}px`);
  root.setProperty("--menu-clip-bottom", `${Math.max(0, rect.height - top - window.innerHeight)}px`);
  return page;
}

function ArrowIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" className={styles.arrow}>
      <path d="M6 14 14 6M7.5 6H14v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/*
 * Small-screen navigation: a white frosted half-sheet that drops from the menu button while
 * the page behind presses back and frosts over. The native popover handles open/close, Esc,
 * light dismiss and the top layer; this component closes it on navigation and drives the
 * page squeeze (html[data-menu]).
 */
export function MobileMenu({ items, action, triggerClassName, triggerStyle }: MobileMenuProps): React.ReactElement {
  const id = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const close = (): void => {
    const sheet = sheetRef.current;
    if (sheet?.matches(":popover-open")) sheet.hidePopover();
  };

  // Covers navigations the links' onClick doesn't see (the action button, back/forward).
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet?.matches(":popover-open")) sheet.hidePopover();
  }, [pathname]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const root = document.documentElement;
    let release = 0;
    const onToggle = (event: Event): void => {
      window.clearTimeout(release);
      if ((event as ToggleEvent).newState === "open") {
        const page = holdPage();
        // Clip first with square corners, commit that style, then squeeze: the corners and
        // the scale then ease in together instead of the clip snapping on.
        root.dataset.menu = "held";
        if (page) void getComputedStyle(page).clipPath;
        root.dataset.menu = "open";
      } else {
        root.dataset.menu = "held";
        release = window.setTimeout(() => {
          if (root.dataset.menu === "held") delete root.dataset.menu;
        }, RELEASE_MS);
      }
    };
    sheet.addEventListener("beforetoggle", onToggle);
    return () => {
      window.clearTimeout(release);
      sheet.removeEventListener("beforetoggle", onToggle);
      delete root.dataset.menu;
    };
  }, []);

  return (
    <>
      <Button variant="glass" size="md" popoverTarget={id} className={triggerClassName} style={triggerStyle}>
        Menu
      </Button>

      <div ref={sheetRef} id={id} popover="auto" data-surface="light" className={styles.sheet}>
        <nav aria-label="Primary" className={`${styles.panel} liquid-glass`}>
          <div className="flex h-[var(--control-height)] items-center justify-between pl-2">
            <p className="text-label font-medium tracking-[0.08em] text-ink-500 uppercase">Menu</p>
            <Button variant="glass" size="md" popoverTarget={id} popoverTargetAction="hide">
              Close
            </Button>
          </div>

          <ul className="mt-3">
            {items.map((item, index) => (
              <li key={item.href} className={styles.row} style={{ "--i": index } as CSSProperties}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`${styles.link} flex min-h-14 items-center gap-4 px-2 text-heading-md font-semibold tracking-tight text-ink-950 aria-[current=page]:text-brand-600`}
                >
                  <span className="w-6 text-label font-medium text-ink-400 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <ArrowIcon />
                </Link>
              </li>
            ))}
          </ul>

          <div className={styles.row} style={{ "--i": items.length } as CSSProperties}>
            <Button href={action.href} size="lg" className="mt-5 w-full">
              {action.label}
            </Button>
          </div>
        </nav>
      </div>
    </>
  );
}
