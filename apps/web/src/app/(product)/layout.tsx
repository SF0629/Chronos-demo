import type { ReactNode } from "react";
import { getMessages } from "@/lib/locale";
import { getLocale } from "@/lib/server-locale";
import { ProductControls } from "./_components/product-controls";
import { ProductNav } from "./_components/product-nav";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-full w-full max-w-[1500px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-base font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              Chronos
            </span>
            <span className="hidden text-xs text-zinc-400 dark:text-zinc-500 lg:inline">
              {messages.product.incidentInvestigation}
            </span>
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ProductNav
              labels={{
                ariaLabel: messages.product.productNavigation,
                dashboard: messages.product.dashboard,
                incidents: messages.product.incidents,
                services: messages.product.services,
              }}
            />
          </div>

          <ProductControls
            locale={locale}
            labels={{
              light: messages.product.light,
              dark: messages.product.dark,
              switchToLight: messages.product.switchToLight,
              switchToDark: messages.product.switchToDark,
              preferences: messages.product.preferences,
            }}
          />
        </div>
      </header>

      <div className="min-h-screen pt-14">{children}</div>
    </div>
  );
}
