"use client";

import { useEffect, useMemo, useState } from "react";

type PricingMode = "FREE" | "FIXED" | "PWYW";

type ReleaseDetailPurchaseCardProps = {
  releaseId: string;
  pricingMode: PricingMode;
  currency: string;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

function formatMoney(currency: string, cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function resolveBuyLabel(input: {
  pricingMode: PricingMode;
  currency: string;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
}) {
  if (input.pricingMode === "FREE") {
    return "Get for Free";
  }

  if (input.pricingMode === "FIXED") {
    return `Buy ${formatMoney(input.currency, input.fixedPriceCents ?? 0)}`;
  }

  const minimum = input.minimumPriceCents ?? 0;
  if (minimum <= 0) {
    return "Pay What You Want";
  }
  return `Buy from ${formatMoney(input.currency, minimum)}`;
}

export default function ReleaseDetailPurchaseCard({
  releaseId,
  pricingMode,
  currency,
  fixedPriceCents,
  minimumPriceCents,
}: ReleaseDetailPurchaseCardProps) {
  const primaryActionButtonClass =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-600";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pwywAmount, setPwywAmount] = useState("");
  const [checkoutFormError, setCheckoutFormError] = useState<string | null>(null);

  const buyLabel = useMemo(
    () =>
      resolveBuyLabel({
        pricingMode,
        currency,
        fixedPriceCents,
        minimumPriceCents,
      }),
    [pricingMode, currency, fixedPriceCents, minimumPriceCents],
  );

  const pwywMinimumDisplay = useMemo(
    () => formatMoney(currency, minimumPriceCents ?? 0),
    [currency, minimumPriceCents],
  );

  useEffect(() => {
    if (!isCheckoutDialogOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        setIsCheckoutDialogOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCheckoutDialogOpen, isSubmitting]);

  function openCheckoutDialog() {
    if (isSubmitting) {
      return;
    }

    const minimum = minimumPriceCents ?? 0;
    setCheckoutEmail("");
    setConfirmEmail("");
    setCheckoutFormError(null);
    setPwywAmount(pricingMode === "PWYW" ? (minimum / 100).toFixed(2) : "");
    setIsCheckoutDialogOpen(true);
  }

  async function onCheckoutSubmit() {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = checkoutEmail.trim().toLowerCase();
    const normalizedConfirmEmail = confirmEmail.trim().toLowerCase();
    const hasEmail = normalizedEmail.length > 0;

    if (pricingMode === "FREE" && !hasEmail) {
      setCheckoutFormError("Email is required for the free library link.");
      return;
    }

    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setCheckoutFormError("Enter a valid email address.");
      return;
    }

    if (hasEmail && normalizedEmail !== normalizedConfirmEmail) {
      setCheckoutFormError("Email addresses do not match.");
      return;
    }

    let amountCents: number | undefined = undefined;
    if (pricingMode === "PWYW") {
      const minimum = minimumPriceCents ?? 0;
      const parsed = Number.parseFloat(pwywAmount.trim());
      if (!Number.isFinite(parsed) || parsed < 0) {
        setCheckoutFormError("Enter a valid amount.");
        return;
      }

      amountCents = Math.round(parsed * 100);
      if (amountCents < minimum) {
        setCheckoutFormError(`Minimum amount is ${formatMoney(currency, minimum)}.`);
        return;
      }
    }

    setIsSubmitting(true);
    setToast(null);
    setCheckoutFormError(null);
    try {
      if (pricingMode === "FREE") {
        const response = await fetch("/api/checkout/free", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            releaseId,
            email: normalizedEmail,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!response.ok || payload?.ok !== true) {
          setCheckoutFormError(payload?.error ?? "Could not start free checkout.");
          setIsSubmitting(false);
          return;
        }

        setIsCheckoutDialogOpen(false);
        setToast({
          kind: "success",
          message: "Library link sent. Check your inbox.",
        });
        setIsSubmitting(false);
        return;
      }

      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          releaseId,
          amountCents,
          email: normalizedEmail.length > 0 ? normalizedEmail : undefined,
          successUrl: `${window.location.origin}/`,
          cancelUrl: window.location.href,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; checkoutUrl?: string }
        | null;

      if (!response.ok || payload?.ok !== true || typeof payload.checkoutUrl !== "string") {
        setCheckoutFormError(payload?.error ?? "Could not create checkout session.");
        setIsSubmitting(false);
        return;
      }

      window.location.assign(payload.checkoutUrl);
    } catch {
      setCheckoutFormError("Network error. Please try again in a moment.");
      setIsSubmitting(false);
    }
  }

  async function onShareClick() {
    try {
      if (navigator.share) {
        await navigator.share({
          url: window.location.href,
        });
        return;
      }

      await navigator.clipboard.writeText(window.location.href);
      setToast({
        kind: "success",
        message: "Link copied to clipboard.",
      });
    } catch {
      setToast({
        kind: "error",
        message: "Could not share this release.",
      });
    }
  }

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className={primaryActionButtonClass}
          onClick={() =>
            setToast({
              kind: "error",
              message: "Playback controls are not wired yet.",
            })
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-[1.35rem] w-[1.35rem] fill-current"
          >
            <path d="M8 6.5v11l9-5.5-9-5.5Z" />
          </svg>
          Play
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={openCheckoutDialog}
          className={`${primaryActionButtonClass} disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:text-emerald-900`}
        >
          {isSubmitting ? "Working..." : buyLabel}
        </button>

        <button
          type="button"
          onClick={() => void onShareClick()}
          aria-label="Share release"
          title="Share"
          className="inline-flex items-center justify-center rounded-xl p-2 text-zinc-700 transition hover:bg-zinc-100"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 stroke-current"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="2.2" />
            <circle cx="6" cy="12" r="2.2" />
            <circle cx="18" cy="19" r="2.2" />
            <path d="M8 11l7.6-4.3M8 13l7.6 4.3" />
          </svg>
        </button>
      </div>

      {isCheckoutDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="checkout-dialog-title" className="text-base font-semibold text-zinc-900">
                  {pricingMode === "FREE" ? "Get This Release" : "Checkout"}
                </h2>
                {pricingMode === "FIXED" ? (
                  <p className="mt-1 text-lg font-semibold text-zinc-900">
                    Price: {formatMoney(currency, fixedPriceCents ?? 0)}
                  </p>
                ) : null}
                {pricingMode === "PWYW" ? (
                  <p className="mt-1 text-lg font-semibold text-zinc-900">
                    Minimum: {pwywMinimumDisplay}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutDialogOpen(false)}
                disabled={isSubmitting}
                aria-label="Close checkout dialog"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 stroke-current"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {pricingMode === "PWYW" ? (
                <label className="block">
                  <span className="mb-1.5 block text-base font-semibold text-zinc-800">Amount</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={Math.max(0, (minimumPriceCents ?? 0) / 100)}
                    step="0.01"
                    value={pwywAmount}
                    onChange={(event) => setPwywAmount(event.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Email {pricingMode === "FREE" ? "" : "(optional)"}
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={checkoutEmail}
                  onChange={(event) => setCheckoutEmail(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Confirm Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  placeholder="Re-enter your email"
                />
              </label>

              {checkoutFormError ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {checkoutFormError}
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCheckoutDialogOpen(false)}
                disabled={isSubmitting}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onCheckoutSubmit()}
                disabled={isSubmitting}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:text-emerald-900"
              >
                {isSubmitting
                  ? "Working..."
                  : pricingMode === "FREE"
                    ? "Send Library Link"
                    : "Continue to Checkout"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
            toast.kind === "error"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
}
