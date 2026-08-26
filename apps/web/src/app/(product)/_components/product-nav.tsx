"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ProductNavLabels = {
  ariaLabel: string;
  dashboard: string;
  incidents: string;
  services: string;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProductNav({ labels }: { labels: ProductNavLabels }) {
  const pathname = usePathname();
  const navigation = [
    { href: "/dashboard", label: labels.dashboard },
    { href: "/incidents", label: labels.incidents },
    { href: "/services", label: labels.services },
  ] as const;

  return (
    <nav aria-label={labels.ariaLabel} className="h-14">
      <ul className="flex h-full min-w-max items-stretch gap-1 sm:gap-2">
        {navigation.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 sm:px-3 ${
                  active
                    ? "font-semibold text-zinc-950 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-zinc-950 dark:text-zinc-50 dark:after:bg-zinc-50"
                    : "font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
