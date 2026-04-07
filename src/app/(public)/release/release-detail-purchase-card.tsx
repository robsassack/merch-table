"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatMoney,
  resolveBuyLabel,
  resolveCurrencyPrefix,
  resolveMayAlreadyOwnRelease,
} from "@/app/(public)/release/release-detail-purchase-card-utils";
import { useReleaseAudioPlayer } from "@/app/(public)/release/release-audio-player";
import type { PricingMode } from "@/app/(public)/release/release-detail-purchase-card-utils";

type ReleaseDetailPurchaseCardProps = {
  releaseId: string;
  previewTrackId: string | null;
  playablePreviewTrackIds: string[];
  pricingMode: PricingMode;
  currency: string;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  initialMayOwnRelease?: boolean;
  hasDownloadableTracks: boolean;
  hasOnlyLossyDownloads: boolean;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

const ALREADY_OWNED_CONFIRMATION_REQUIRED_CODE =
  "ALREADY_OWNED_CONFIRMATION_REQUIRED";

export default function ReleaseDetailPurchaseCard({
  releaseId,
  previewTrackId,
  playablePreviewTrackIds,
  pricingMode,
  currency,
  fixedPriceCents,
  minimumPriceCents,
  initialMayOwnRelease = false,
  hasDownloadableTracks,
  hasOnlyLossyDownloads,
}: ReleaseDetailPurchaseCardProps) {
  const primaryActionButtonClass =
    "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--release-accent)] px-4 py-1.5 text-sm font-semibold text-[var(--release-accent-contrast)] transition hover:bg-[var(--release-accent-hover)]";
  const { activeTrackId, isPlaybackVisuallyActive, playTrack } =
    useReleaseAudioPlayer();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pwywAmount, setPwywAmount] = useState("");
  const [checkoutFormError, setCheckoutFormError] = useState<string | null>(null);
  const [alreadyOwnedWarning, setAlreadyOwnedWarning] = useState<string | null>(null);
  const [confirmAlreadyOwned, setConfirmAlreadyOwned] = useState(false);
  const mayAlreadyOwnRelease = useMemo(
    () =>
      resolveMayAlreadyOwnRelease({
        initialMayOwnRelease,
        releaseId,
      }),
    [initialMayOwnRelease, releaseId],
  );

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

  const pwywCurrencyPrefix = useMemo(() => resolveCurrencyPrefix(currency), [currency]);
  const hasPreviewTrack = previewTrackId !== null;
  const isCurrentReleaseTrackActive = Boolean(
    activeTrackId && playablePreviewTrackIds.includes(activeTrackId),
  );
  const playbackButtonLabel = !hasPreviewTrack
    ? "No Preview"
    : isCurrentReleaseTrackActive && isPlaybackVisuallyActive
      ? "Pause"
      : "Play";

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
    setAlreadyOwnedWarning(null);
    setConfirmAlreadyOwned(false);
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
    const shouldUseFreeCheckout =
      pricingMode === "FREE" || (pricingMode === "PWYW" && amountCents === 0);

    if (shouldUseFreeCheckout && !hasEmail) {
      setCheckoutFormError("Email is required for the free library link.");
      return;
    }

    if (!shouldUseFreeCheckout && alreadyOwnedWarning && !confirmAlreadyOwned) {
      setCheckoutFormError("Please confirm to continue with a repeat purchase.");
      return;
    }

    setIsSubmitting(true);
    setToast(null);
    setCheckoutFormError(null);
    try {
      if (shouldUseFreeCheckout) {
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
          | { ok?: boolean; error?: string; code?: string }
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
          confirmAlreadyOwned,
          successUrl: `${window.location.origin}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: window.location.href,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string; checkoutUrl?: string }
        | null;

      if (
        response.status === 409 &&
        payload?.code === ALREADY_OWNED_CONFIRMATION_REQUIRED_CODE &&
        !confirmAlreadyOwned
      ) {
        setAlreadyOwnedWarning(
          payload.error ??
            "This email already owns this release. Confirm below to continue anyway.",
        );
        setCheckoutFormError(null);
        setIsSubmitting(false);
        return;
      }

      if (!response.ok || payload?.ok !== true || typeof payload.checkoutUrl !== "string") {
        setCheckoutFormError(payload?.error ?? "Could not create checkout session.");
        setIsSubmitting(false);
        return;
      }

      window.location.assign(payload.checkoutUrl);
      return;
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
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "NotAllowedError")
      ) {
        return;
      }
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
          disabled={!hasPreviewTrack}
          className={`${primaryActionButtonClass} disabled:cursor-not-allowed disabled:bg-[var(--release-accent-soft)] disabled:text-zinc-900`}
          onClick={() => {
            if (!hasPreviewTrack) {
              return;
            }

            if (activeTrackId && playablePreviewTrackIds.includes(activeTrackId)) {
              playTrack(activeTrackId);
              return;
            }

            if (previewTrackId) {
              playTrack(previewTrackId);
            }
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-[1.35rem] w-[1.35rem]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isCurrentReleaseTrackActive && isPlaybackVisuallyActive ? (
              <path d="M9 6v12M15 6v12" />
            ) : (
              <path d="M8 6.5v11l9-5.5-9-5.5Z" />
            )}
          </svg>
          {playbackButtonLabel}
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={openCheckoutDialog}
          className={`${primaryActionButtonClass} disabled:cursor-not-allowed disabled:bg-[var(--release-accent-soft)] disabled:text-zinc-900`}
        >
          {isSubmitting ? "Working..." : buyLabel}
        </button>

        <button
          type="button"
          onClick={() => void onShareClick()}
          aria-label="Share release"
          title="Share"
          className="inline-flex cursor-pointer items-center justify-center rounded-xl p-2 text-zinc-700 transition hover:bg-zinc-100"
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

      {mayAlreadyOwnRelease ? (
        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          You may already own this release. If so, you can use{" "}
          <a
            href="/find-my-purchases"
            className="font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-900"
          >
            Find My Purchases
          </a>{" "}
          to reopen your library.
        </div>
      ) : null}

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
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
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
              {!hasDownloadableTracks ? (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  No tracks are currently available for download.
                </div>
              ) : null}
              {hasDownloadableTracks && hasOnlyLossyDownloads ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Only lossy downloads are currently available for this release.
                </div>
              ) : null}

              {pricingMode === "PWYW" ? (
                <label className="block">
                  <span className="mb-1.5 block text-base font-semibold text-zinc-800">Amount</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base font-semibold text-zinc-500">
                      {pwywCurrencyPrefix}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={Math.max(0, (minimumPriceCents ?? 0) / 100)}
                      step="0.01"
                      value={pwywAmount}
                      onChange={(event) => setPwywAmount(event.target.value)}
                      disabled={isSubmitting}
                      className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-base font-medium text-zinc-900 outline-none transition focus:border-[var(--release-accent)] focus:ring-2 focus:ring-[var(--release-accent-soft)] disabled:cursor-not-allowed disabled:bg-zinc-100"
                    />
                  </div>
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
                  onChange={(event) => {
                    setCheckoutEmail(event.target.value);
                    if (alreadyOwnedWarning) {
                      setAlreadyOwnedWarning(null);
                      setConfirmAlreadyOwned(false);
                    }
                  }}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--release-accent)] focus:ring-2 focus:ring-[var(--release-accent-soft)] disabled:cursor-not-allowed disabled:bg-zinc-100"
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
                  onChange={(event) => {
                    setConfirmEmail(event.target.value);
                    if (alreadyOwnedWarning) {
                      setAlreadyOwnedWarning(null);
                      setConfirmAlreadyOwned(false);
                    }
                  }}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--release-accent)] focus:ring-2 focus:ring-[var(--release-accent-soft)] disabled:cursor-not-allowed disabled:bg-zinc-100"
                  placeholder="Re-enter your email"
                />
              </label>

              {alreadyOwnedWarning ? (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  <p>{alreadyOwnedWarning}</p>
                  <label className="mt-2 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={confirmAlreadyOwned}
                      onChange={(event) => {
                        setConfirmAlreadyOwned(event.target.checked);
                        setCheckoutFormError(null);
                      }}
                      disabled={isSubmitting}
                      className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-300"
                    />
                    <span>I understand and want to continue with a repeat purchase.</span>
                  </label>
                </div>
              ) : null}

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
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onCheckoutSubmit()}
                disabled={isSubmitting}
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl bg-[var(--release-accent)] px-4 text-sm font-semibold text-[var(--release-accent-contrast)] transition hover:bg-[var(--release-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--release-accent-soft)] disabled:text-zinc-900"
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
              : "border-[var(--release-accent-soft)] bg-[var(--release-bg-start)] text-zinc-900"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
}
