"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  formatMoney,
  resolveBuyLabel,
  resolveCurrencyPrefix,
} from "@/app/(public)/release/release-detail-purchase-card-utils";
import { useReleaseAudioPlayer } from "@/app/(public)/release/release-audio-player";
import { isReleaseOwnedInStorage } from "@/app/(public)/release/owned-release-storage";
import ReleaseCheckoutDialog from "@/app/(public)/release/release-checkout-dialog";
import type { PricingMode } from "@/app/(public)/release/release-detail-purchase-card-utils";
import {
  inputModeForCurrency,
  majorInputToMinor,
  minInputForCurrency,
  minorToMajorInput,
  stepForCurrency,
} from "@/lib/money";

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
const subscribeNoop = () => () => {};

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
  const primaryActionStyle = {
    backgroundColor: "var(--release-accent, rgb(51 65 85))",
    color: "var(--release-accent-contrast, rgb(255 255 255))",
  } as const;
  const primaryActionButtonClass =
    "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-600 bg-[var(--release-accent)] text-[var(--release-accent-contrast)] hover:bg-[var(--release-accent-hover)]";
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
  const storageMayOwnRelease = useSyncExternalStore(
    subscribeNoop,
    () => {
      try {
        return isReleaseOwnedInStorage(window.localStorage, releaseId);
      } catch {
        return false;
      }
    },
    () => false,
  );
  const mayAlreadyOwnRelease = initialMayOwnRelease || storageMayOwnRelease;

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
  const pwywInputMode = useMemo(() => inputModeForCurrency(currency), [currency]);
  const pwywInputStep = useMemo(() => stepForCurrency(currency), [currency]);
  const pwywInputMin = useMemo(
    () => minInputForCurrency(minimumPriceCents ?? 0, currency),
    [currency, minimumPriceCents],
  );
  const hasPreviewTrack = previewTrackId !== null;
  const checkoutErrorId = "checkout-form-error";
  const alreadyOwnedWarningId = "checkout-owned-warning";
  const checkoutEmailHintId = "checkout-email-hint";
  const isCurrentReleaseTrackActive = Boolean(
    activeTrackId && playablePreviewTrackIds.includes(activeTrackId),
  );
  const playbackButtonLabel =
    isCurrentReleaseTrackActive && isPlaybackVisuallyActive
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
    setPwywAmount(pricingMode === "PWYW" ? minorToMajorInput(minimum, currency) : "");
    setIsCheckoutDialogOpen(true);
  }

  async function onCheckoutSubmit() {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = checkoutEmail.trim().toLowerCase();
    const normalizedConfirmEmail = confirmEmail.trim().toLowerCase();
    const hasEmail = normalizedEmail.length > 0;

    if (!hasEmail) {
      setCheckoutFormError("Email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setCheckoutFormError("Enter a valid email address.");
      return;
    }

    if (normalizedEmail !== normalizedConfirmEmail) {
      setCheckoutFormError("Email addresses do not match.");
      return;
    }
    let amountCents: number | undefined = undefined;
    if (pricingMode === "PWYW") {
      const minimum = minimumPriceCents ?? 0;
      const parsedAmount = majorInputToMinor(pwywAmount, currency);
      if (parsedAmount === null || parsedAmount < 0) {
        setCheckoutFormError("Enter a valid amount.");
        return;
      }
      amountCents = parsedAmount;
      if (parsedAmount < minimum) {
        setCheckoutFormError(`Minimum amount is ${formatMoney(currency, minimum)}.`);
        return;
      }
    }
    const shouldUseFreeCheckout =
      pricingMode === "FREE" || (pricingMode === "PWYW" && amountCents === 0);

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
          email: normalizedEmail,
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

  function onCheckoutEmailChange(nextValue: string) {
    setCheckoutEmail(nextValue);
    if (alreadyOwnedWarning) {
      setAlreadyOwnedWarning(null);
      setConfirmAlreadyOwned(false);
    }
  }

  function onConfirmEmailChange(nextValue: string) {
    setConfirmEmail(nextValue);
    if (alreadyOwnedWarning) {
      setAlreadyOwnedWarning(null);
      setConfirmAlreadyOwned(false);
    }
  }

  function onConfirmAlreadyOwnedChange(nextValue: boolean) {
    setConfirmAlreadyOwned(nextValue);
    setCheckoutFormError(null);
  }

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        {hasPreviewTrack ? (
          <button
            type="button"
            className={primaryActionButtonClass}
            style={primaryActionStyle}
            onClick={() => {
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
        ) : null}

        <button
          type="button"
          disabled={isSubmitting}
          onClick={openCheckoutDialog}
          className={`${primaryActionButtonClass} disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:bg-[var(--release-accent-soft)] disabled:text-zinc-900`}
          style={primaryActionStyle}
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

      <ReleaseCheckoutDialog
        isOpen={isCheckoutDialogOpen}
        isSubmitting={isSubmitting}
        pricingMode={pricingMode}
        currency={currency}
        fixedPriceCents={fixedPriceCents}
        pwywMinimumDisplay={pwywMinimumDisplay}
        pwywCurrencyPrefix={pwywCurrencyPrefix}
        pwywInputMin={pwywInputMin}
        pwywInputStep={pwywInputStep}
        pwywInputMode={pwywInputMode}
        pwywAmount={pwywAmount}
        checkoutEmail={checkoutEmail}
        confirmEmail={confirmEmail}
        checkoutFormError={checkoutFormError}
        alreadyOwnedWarning={alreadyOwnedWarning}
        confirmAlreadyOwned={confirmAlreadyOwned}
        hasDownloadableTracks={hasDownloadableTracks}
        hasOnlyLossyDownloads={hasOnlyLossyDownloads}
        checkoutErrorId={checkoutErrorId}
        alreadyOwnedWarningId={alreadyOwnedWarningId}
        checkoutEmailHintId={checkoutEmailHintId}
        onClose={() => setIsCheckoutDialogOpen(false)}
        onSubmit={() => void onCheckoutSubmit()}
        onPwywAmountChange={setPwywAmount}
        onCheckoutEmailChange={onCheckoutEmailChange}
        onConfirmEmailChange={onConfirmEmailChange}
        onConfirmAlreadyOwnedChange={onConfirmAlreadyOwnedChange}
      />

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
