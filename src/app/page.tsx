"use client";

import { useSyncExternalStore } from "react";

type StorefrontTheme = "light" | "dark";

const STOREFRONT_THEME_KEY = "storefront-theme";
const STOREFRONT_THEME_EVENT = "storefront-theme-change";

function readThemeFromBrowser(): StorefrontTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const saved = window.localStorage.getItem(STOREFRONT_THEME_KEY);
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeToThemeStore(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === STOREFRONT_THEME_KEY) {
      listener();
    }
  };
  const onThemeChange = () => listener();

  window.addEventListener("storage", onStorage);
  window.addEventListener(STOREFRONT_THEME_EVENT, onThemeChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STOREFRONT_THEME_EVENT, onThemeChange);
  };
}

export default function Home() {
  const theme = useSyncExternalStore(
    subscribeToThemeStore,
    readThemeFromBrowser,
    () => "light",
  );

  const setTheme = (nextTheme: StorefrontTheme) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STOREFRONT_THEME_KEY, nextTheme);
    window.dispatchEvent(new Event(STOREFRONT_THEME_EVENT));
  };

  const isDark = theme === "dark";

  return (
    <main
      className={`min-h-screen px-4 py-10 sm:px-6 sm:py-16 ${
        isDark
          ? "bg-[radial-gradient(circle_at_20%_20%,#1f2a44,transparent_35%),radial-gradient(circle_at_80%_0%,#1d3d36,transparent_30%),linear-gradient(180deg,#0b1220_0%,#0d141d_100%)] text-zinc-100"
          : "bg-[radial-gradient(circle_at_15%_20%,#e6f8ee,transparent_35%),radial-gradient(circle_at_85%_0%,#e9f2ff,transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f3f6f8_100%)] text-zinc-900"
      }`}
    >
      <section
        className={`mx-auto flex w-full max-w-4xl flex-col gap-8 rounded-3xl border p-8 shadow-[0_30px_80px_-38px_rgba(20,24,38,0.45)] sm:p-10 ${
          isDark
            ? "border-slate-700 bg-slate-900/85 backdrop-blur text-zinc-100"
            : "border-zinc-200/80 bg-white/90 backdrop-blur text-zinc-900"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p
              className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                isDark ? "text-emerald-300" : "text-emerald-700"
              }`}
            >
              Storefront Preview
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Merch Table
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              isDark
                ? "border-slate-600 bg-slate-800 text-zinc-100 hover:bg-slate-700"
                : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>

        <p className={`${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
          Public storefront theme can be toggled here. Setup and admin pages stay in
          dark mode for operator workflows.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <article
            className={`rounded-2xl border p-5 ${
              isDark
                ? "border-slate-700 bg-slate-800/70"
                : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <p className="text-sm font-medium">Featured Release</p>
            <p className={`mt-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
              Placeholder block for upcoming storefront layout work.
            </p>
          </article>
          <article
            className={`rounded-2xl border p-5 ${
              isDark
                ? "border-slate-700 bg-slate-800/70"
                : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <p className="text-sm font-medium">Top Seller</p>
            <p className={`mt-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
              Toggle persists for this browser via local storage.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
