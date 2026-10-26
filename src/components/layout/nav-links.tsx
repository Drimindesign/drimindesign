"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/content/site";
import { cn } from "@/lib/utils/cn";

interface NavLinksProps {
  items: readonly NavItem[];
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/* Desktop pill links. Client-only because the active state follows the current route. */
export function NavLinks({ items }: NavLinksProps): React.ReactElement {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center rounded-pill px-4 text-label font-medium transition-[color,background-color,box-shadow] duration-200 ease-standard",
                active
                  ? "bg-glass-active text-glass-active-fg shadow-[var(--inset-raise-dark)]"
                  : "text-glass-fg-muted hover:text-glass-fg",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
