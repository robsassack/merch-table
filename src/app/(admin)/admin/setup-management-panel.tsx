"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AdvancedPanel } from "./setup-management-advanced-panel";
import { StoreSettingsPanel } from "./setup-management-store-settings-panel";
import { IntegrationsPanel, StatusPanel } from "./setup-management-subpanels";

type SetupSection = "store" | "integrations" | "status" | "advanced";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const panelCardClassName = "rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6";

const setupSections: Array<{ id: SetupSection; label: string; description: string }> = [
  {
    id: "store",
    label: "Store",
    description: "Brand and storefront defaults",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Stripe, SMTP, and storage",
  },
  {
    id: "status",
    label: "Status",
    description: "Service and worker health",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Safety actions and reset",
  },
];

function parseSetupSection(value: string | null): SetupSection {
  return setupSections.some((section) => section.id === value)
    ? (value as SetupSection)
    : "store";
}

export function SetupManagementPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeSection = parseSetupSection(searchParams.get("section"));

  const activeSectionMeta = useMemo(
    () => setupSections.find((section) => section.id === activeSection) ?? setupSections[0],
    [activeSection],
  );

  const onSelectSection = useCallback(
    (section: SetupSection) => {
      if (section === activeSection) {
        return;
      }

      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (section === "store") {
        nextSearchParams.delete("section");
      } else {
        nextSearchParams.set("section", section);
      }

      const queryString = nextSearchParams.toString();
      router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [activeSection, pathname, router, searchParams],
  );

  return (
    <>
      <section className={panelCardClassName}>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Store</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Use these sections to manage storefront details, integrations, system health, and advanced tools.
        </p>

        <nav
          className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Store sections"
          role="tablist"
        >
          {setupSections.map((section) => {
            const selected = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-current={selected ? "page" : undefined}
                onClick={() => onSelectSection(section.id)}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  selected
                    ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                    : "border-slate-700 bg-slate-900/70 text-zinc-300 hover:border-slate-500 hover:text-zinc-100"
                }`}
              >
                <p className="text-sm font-medium">{section.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{section.description}</p>
              </button>
            );
          })}
        </nav>
      </section>

      <div className="mt-4" role="tabpanel" aria-label={activeSectionMeta.label}>
        {activeSection === "store" ? (
          <StoreSettingsPanel
            panelCardClassName={panelCardClassName}
            primaryButtonClassName={primaryButtonClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
        {activeSection === "integrations" ? (
          <IntegrationsPanel
            panelCardClassName={panelCardClassName}
            primaryButtonClassName={primaryButtonClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
        {activeSection === "status" ? (
          <StatusPanel
            panelCardClassName={panelCardClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
        {activeSection === "advanced" ? (
          <AdvancedPanel
            panelCardClassName={panelCardClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
      </div>
    </>
  );
}
