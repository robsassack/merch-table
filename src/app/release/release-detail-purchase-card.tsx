"use client";

import { useMemo, useState } from "react";

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

  async function onBuyClick() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setToast(null);

    try {
      if (pricingMode === "FREE") {
        const email = window.prompt("Enter your email for the free library link:");
        const normalizedEmail = (email ?? "").trim().toLowerCase();
        if (!normalizedEmail) {
          setIsSubmitting(false);
          return;
        }

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
          setToast({
            kind: "error",
            message: payload?.error ?? "Could not start free checkout.",
          });
          setIsSubmitting(false);
          return;
        }

        setToast({
          kind: "success",
          message: "Library link sent. Check your inbox.",
        });
        setIsSubmitting(false);
        return;
      }

      let amountCents: number | undefined = undefined;
      if (pricingMode === "PWYW") {
        const minimum = minimumPriceCents ?? 0;
        const rawAmount = window.prompt(
          `Enter your amount in ${currency.toUpperCase()} (minimum ${formatMoney(currency, minimum)}):`,
        );
        if (!rawAmount) {
          setIsSubmitting(false);
          return;
        }

        const parsed = Number.parseFloat(rawAmount.trim());
        if (!Number.isFinite(parsed) || parsed < 0) {
          setToast({
            kind: "error",
            message: "Enter a valid amount.",
          });
          setIsSubmitting(false);
          return;
        }

        amountCents = Math.round(parsed * 100);
        if (amountCents < minimum) {
          setToast({
            kind: "error",
            message: `Minimum amount is ${formatMoney(currency, minimum)}.`,
          });
          setIsSubmitting(false);
          return;
        }
      }

      const email = window.prompt("Email for receipt (optional):") ?? "";
      const normalizedEmail = email.trim().toLowerCase();

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
        setToast({
          kind: "error",
          message: payload?.error ?? "Could not create checkout session.",
        });
        setIsSubmitting(false);
        return;
      }

      window.location.assign(payload.checkoutUrl);
    } catch {
      setToast({
        kind: "error",
        message: "Network error. Please try again in a moment.",
      });
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
          onClick={onBuyClick}
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
