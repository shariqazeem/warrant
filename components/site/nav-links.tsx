"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

/**
 * The nav's doors, marking the one you are on. The only reason this is a client component is
 * `aria-current`, which needs the path.
 */
export function NavLinks({doors}: {doors: ReadonlyArray<{href: string; label: string}>}) {
  const path = usePathname() ?? "";
  return (
    <ul className="wa-nav-doors">
      {doors.map((d) => {
        const here = path === d.href || path.startsWith(`${d.href}/`);
        return (
          <li key={d.href}>
            <Link href={d.href} className="wa-nav-link" aria-current={here ? "page" : undefined}>
              {d.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
