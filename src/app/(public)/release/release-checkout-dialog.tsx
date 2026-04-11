import { formatMoney, type PricingMode } from "@/app/(public)/release/release-detail-purchase-card-utils";

type ReleaseCheckoutDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  pricingMode: PricingMode;
  currency: string;
  fixedPriceCents: number | null;
  pwywMinimumDisplay: string;
  pwywCurrencyPrefix: string;
  pwywInputMin: string;
  pwywInputStep: string;
  pwywInputMode: "numeric" | "decimal";
  pwywAmount: string;
  checkoutEmail: string;
  confirmEmail: string;
  checkoutFormError: string | null;
  alreadyOwnedWarning: string | null;
  confirmAlreadyOwned: boolean;
  hasDownloadableTracks: boolean;
  hasOnlyLossyDownloads: boolean;
  checkoutErrorId: string;
  alreadyOwnedWarningId: string;
  checkoutEmailHintId: string;
  onClose: () => void;
  onSubmit: () => void;
  onPwywAmountChange: (value: string) => void;
  onCheckoutEmailChange: (value: string) => void;
  onConfirmEmailChange: (value: string) => void;
  onConfirmAlreadyOwnedChange: (value: boolean) => void;
};

export default function ReleaseCheckoutDialog({
  isOpen,
  isSubmitting,
  pricingMode,
  currency,
  fixedPriceCents,
  pwywMinimumDisplay,
  pwywCurrencyPrefix,
  pwywInputMin,
  pwywInputStep,
  pwywInputMode,
  pwywAmount,
  checkoutEmail,
  confirmEmail,
  checkoutFormError,
  alreadyOwnedWarning,
  confirmAlreadyOwned,
  hasDownloadableTracks,
  hasOnlyLossyDownloads,
  checkoutErrorId,
  alreadyOwnedWarningId,
  checkoutEmailHintId,
  onClose,
  onSubmit,
  onPwywAmountChange,
  onCheckoutEmailChange,
  onConfirmEmailChange,
  onConfirmAlreadyOwnedChange,
}: ReleaseCheckoutDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
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
            onClick={onClose}
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
                  id="checkout-amount"
                  type="number"
                  inputMode={pwywInputMode}
                  min={pwywInputMin}
                  step={pwywInputStep}
                  value={pwywAmount}
                  onChange={(event) => onPwywAmountChange(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-base font-medium text-zinc-900 outline-none transition focus:border-[var(--release-accent)] focus:ring-2 focus:ring-[var(--release-accent-soft)] disabled:cursor-not-allowed disabled:bg-zinc-100"
                  aria-invalid={Boolean(checkoutFormError)}
                  aria-describedby={checkoutFormError ? checkoutErrorId : undefined}
                />
              </div>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-700">Email</span>
            <input
              id="checkout-email"
              type="email"
              autoComplete="email"
              value={checkoutEmail}
              onChange={(event) => onCheckoutEmailChange(event.target.value)}
              disabled={isSubmitting}
              required
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--release-accent)] focus:ring-2 focus:ring-[var(--release-accent-soft)] disabled:cursor-not-allowed disabled:bg-zinc-100"
              placeholder="you@example.com"
              aria-invalid={Boolean(checkoutFormError)}
              aria-describedby={
                checkoutFormError
                  ? `${checkoutEmailHintId} ${checkoutErrorId}`
                  : checkoutEmailHintId
              }
            />
          </label>
          <p id={checkoutEmailHintId} className="text-xs text-zinc-600">
            Use the email tied to your buyer library.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-700">
              Confirm Email
            </span>
            <input
              id="checkout-confirm-email"
              type="email"
              autoComplete="email"
              value={confirmEmail}
              onChange={(event) => onConfirmEmailChange(event.target.value)}
              disabled={isSubmitting}
              required
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--release-accent)] focus:ring-2 focus:ring-[var(--release-accent-soft)] disabled:cursor-not-allowed disabled:bg-zinc-100"
              placeholder="Re-enter your email"
              aria-invalid={Boolean(checkoutFormError)}
              aria-describedby={checkoutFormError ? checkoutErrorId : undefined}
            />
          </label>

          {alreadyOwnedWarning ? (
            <div
              id={alreadyOwnedWarningId}
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              <p>{alreadyOwnedWarning}</p>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmAlreadyOwned}
                  onChange={(event) => onConfirmAlreadyOwnedChange(event.target.checked)}
                  disabled={isSubmitting}
                  className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-300"
                  aria-describedby={alreadyOwnedWarningId}
                />
                <span>I understand and want to continue with a repeat purchase.</span>
              </label>
            </div>
          ) : null}

          {checkoutFormError ? (
            <div
              id={checkoutErrorId}
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {checkoutFormError}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
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
  );
}
