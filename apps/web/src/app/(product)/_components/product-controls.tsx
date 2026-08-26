"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";

export type ProductControlLabels = {
  light: string;
  dark: string;
  switchToLight: string;
  switchToDark: string;
  preferences: string;
};

type Theme = "light" | "dark";

const THEME_EVENT = "chronos-theme-change";

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribeToTheme(callback: () => void): () => void {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  try {
    window.localStorage.setItem("chronos_theme", theme);
  } catch {
    // The visual theme still applies for this page if browser storage is unavailable.
  }

  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ProductControls({
  locale,
  labels,
}: {
  locale: Locale;
  labels: ProductControlLabels;
}) {
  const router = useRouter();
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "light");

  function setLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;

    document.cookie = `chronos_locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label={labels.preferences}
      className="flex shrink-0 items-center gap-2.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:text-xs"
    >
      <div className="flex items-center gap-0.5 border-l border-zinc-200 pl-2.5 dark:border-zinc-800 sm:pl-3">
        <button
          type="button"
          onClick={() => setLocale("ko")}
          aria-pressed={locale === "ko"}
          className={`cursor-pointer rounded-sm px-1 py-1.5 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 ${
            locale === "ko"
              ? "font-semibold text-zinc-950 underline decoration-2 underline-offset-4 dark:text-zinc-50"
              : "hover:text-zinc-950 dark:hover:text-zinc-50"
          }`}
        >
          KO
        </button>
        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
          /
        </span>
        <button
          type="button"
          onClick={() => setLocale("en")}
          aria-pressed={locale === "en"}
          className={`cursor-pointer rounded-sm px-1 py-1.5 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 ${
            locale === "en"
              ? "font-semibold text-zinc-950 underline decoration-2 underline-offset-4 dark:text-zinc-50"
              : "hover:text-zinc-950 dark:hover:text-zinc-50"
          }`}
        >
          EN
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-l border-zinc-200 pl-2.5 dark:border-zinc-800 sm:pl-3">
        <button
          type="button"
          onClick={() => applyTheme("light")}
          aria-pressed={theme === "light"}
          aria-label={labels.switchToLight}
          className={`cursor-pointer rounded-sm px-1 py-1.5 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 ${
            theme === "light"
              ? "font-semibold text-zinc-950 underline decoration-2 underline-offset-4 dark:text-zinc-50"
              : "hover:text-zinc-950 dark:hover:text-zinc-50"
          }`}
        >
          {labels.light}
        </button>
        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
          /
        </span>
        <button
          type="button"
          onClick={() => applyTheme("dark")}
          aria-pressed={theme === "dark"}
          aria-label={labels.switchToDark}
          className={`cursor-pointer rounded-sm px-1 py-1.5 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 ${
            theme === "dark"
              ? "font-semibold text-zinc-950 underline decoration-2 underline-offset-4 dark:text-zinc-50"
              : "hover:text-zinc-950 dark:hover:text-zinc-50"
          }`}
        >
          {labels.dark}
        </button>
      </div>
    </div>
  );
}
