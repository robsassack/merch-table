"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { buyerTheme, resolveBrandGlyph } from "@/app/buyer-theme";

type RequestState = "idle" | "submitting";
type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

type FindMyPurchasesPageClientProps = { brandLabel: string };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function FindMyPurchasesPageClient({
  brandLabel,
}: FindMyPurchasesPageClientProps) {
  const brandGlyph = resolveBrandGlyph(brandLabel);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [toast, setToast] = useState<ToastState>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const canSubmit = normalizedEmail.length > 0 && state !== "submitting";

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutMs = toast.kind === "success" ? 6_000 : 10_000;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, timeoutMs);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setState("submitting");
    setToast(null);

    try {
      const response = await fetch("/api/library/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (response.ok) {
        setToast({
          kind: "success",
          message:
            "Check your inbox. If this email has purchases, a fresh library link has been sent.",
        });
        setState("idle");
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setToast({
        kind: "error",
        message: payload?.error ?? "Could not process your request.",
      });
      setState("idle");
    } catch {
      setToast({
        kind: "error",
        message: "Network error. Please try again in a moment.",
      });
      setState("idle");
    }
  }

  return (
    <main className={buyerTheme.page}>
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
          <div
            role={toast.kind === "error" ? "alert" : "status"}
            aria-live={toast.kind === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex w-full max-w-2xl items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm shadow-xl backdrop-blur ${
              toast.kind === "error"
                ? "border-rose-700/70 bg-rose-950/90 text-rose-100"
                : "border-emerald-700/70 bg-emerald-950/90 text-emerald-100"
            }`}
          >
            <p>{toast.message}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className={`shrink-0 rounded border px-2 py-0.5 text-xs ${
                toast.kind === "error"
                  ? "border-rose-600/70 text-rose-200 hover:bg-rose-900/70"
                  : "border-emerald-600/70 text-emerald-200 hover:bg-emerald-900/70"
              }`}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <header className={buyerTheme.header}>
        <div className={buyerTheme.headerInner}>
          <div className="flex items-center gap-3">
            <span className={buyerTheme.brandBadge}>
              {brandGlyph}
            </span>
            <p className="text-lg font-semibold tracking-tight">{brandLabel}</p>
          </div>
          <nav className={buyerTheme.nav}>
            <Link
              href="/library"
              className={`${buyerTheme.navLink} inline-flex h-9 w-9 items-center justify-center rounded-full`}
              aria-label="Library"
              title="Library"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                library_music
              </span>
              <span className="sr-only">Library</span>
            </Link>
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"
              aria-current="page"
              aria-label="Find My Purchases"
              title="Find My Purchases"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                receipt
              </span>
              <span className="sr-only">Find My Purchases</span>
            </span>
          </nav>
        </div>
      </header>

      <section className="mx-auto mb-12 flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className={`${buyerTheme.panel} w-full`}>
          <p className={buyerTheme.eyebrow}>
            Buyer Library
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find My Purchases
          </h1>
          <p className={buyerTheme.subtitle}>
            Enter the email used at checkout and we&apos;ll resend your library link.
          </p>

          <form className="mt-6" onSubmit={onSubmit}>
            <label
              htmlFor="purchase-email"
              className="block text-sm font-medium text-zinc-800"
            >
              Purchase email
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="purchase-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className={buyerTheme.input}
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className={`${buyerTheme.buttonPrimary} w-full sm:w-auto`}
              >
                {state === "submitting" ? "Sending..." : "Send Library Link"}
              </button>
            </div>
          </form>
        </div>

      </section>
    </main>
  );
}
