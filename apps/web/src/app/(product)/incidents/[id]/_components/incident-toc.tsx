"use client";

import { useEffect, useMemo, useState } from "react";

export type IncidentTocLabels = {
  ariaLabel: string;
  summary: string;
  relatedChanges: string;
  metricSummary: string;
  timeline: string;
  changesShort: string;
  metricsShort: string;
  onThisIncident: string;
  incidentSections: string;
};

export function IncidentToc({
  labels,
  compact = false,
}: {
  labels: IncidentTocLabels;
  compact?: boolean;
}) {
  const sections = useMemo(
    () => [
      { id: "summary", label: labels.summary, compactLabel: labels.summary },
      { id: "related-changes", label: labels.relatedChanges, compactLabel: labels.changesShort },
      { id: "metric-summary", label: labels.metricSummary, compactLabel: labels.metricsShort },
      { id: "timeline", label: labels.timeline, compactLabel: labels.timeline },
    ] as const,
    [labels],
  );
  const [activeId, setActiveId] = useState<string>("summary");

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sections]);

  if (compact) {
    return (
      <nav aria-label={labels.ariaLabel} className="xl:hidden">
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto border-y border-zinc-200 py-2 text-xs dark:border-zinc-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">{labels.incidentSections}</span>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeId === section.id ? "location" : undefined}
              className={`shrink-0 rounded-sm py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 ${
                activeId === section.id
                  ? "font-semibold text-zinc-950 underline decoration-2 underline-offset-4 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              {section.compactLabel}
            </a>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={labels.ariaLabel} className="sticky top-20 hidden xl:block">
      <p className="mb-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{labels.onThisIncident}</p>
      <ol className="border-l border-zinc-200 dark:border-zinc-800">
        {sections.map((section) => {
          const active = activeId === section.id;

          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active ? "location" : undefined}
                className={`-ml-px block rounded-r-sm border-l-2 py-1.5 pl-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 ${
                  active
                    ? "border-zinc-950 font-semibold text-zinc-950 dark:border-zinc-50 dark:text-zinc-50"
                    : "border-transparent text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
