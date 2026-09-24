"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect} from "react";

/**
 * The nav's doors, marking the one you are on. It is a client component for `aria-current`,
 * which needs the path.
 *
 * It also keeps the skip link honest: every page's <main> should carry id="main", and a page
 * that forgot is given it here, so "Skip to content" never points at nothing.
 */
export function NavLinks({doors}: {doors: ReadonlyArray<{href: string; label: string}>}) {
  const path = usePathname() ?? "";

  useEffect(() => {
    if (!document.getElementById("main")) document.querySelector("main")?.setAttribute("id", "main");
  }, [path]);

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
