import { formatCurrency } from "./utils";
import type { ReleaseDraft } from "./types";

type RenderPricingDetailsInput = {
  draft: ReleaseDraft;
  currency: string;
  minimumPriceFloorCents: number;
  getPricingEstimate: (
    draft: ReleaseDraft,
    currency: string,
  ) => {
    grossLabel: string;
    feeLabel: string;
    netLabel: string;
    belowFloor: boolean;
  } | null;
};

export function renderReleasePricingDetails(input: RenderPricingDetailsInput) {
  const { draft, currency, minimumPriceFloorCents, getPricingEstimate } = input;

  if (draft.pricingMode === "FREE") {
    return (
      <p className="mt-2 text-xs text-zinc-500">
        Free release. Stripe is bypassed and no minimum floor applies.
      </p>
    );
  }

  const estimate = getPricingEstimate(draft, currency);

  return (
    <>
      <p className="mt-2 text-xs text-zinc-500">
        Minimum system floor:{" "}
        {draft.pricingMode === "PWYW" && draft.allowFreeCheckout
          ? `${formatCurrency(0, currency)} (free checkout enabled) or ${formatCurrency(minimumPriceFloorCents, currency)}+`
          : formatCurrency(minimumPriceFloorCents, currency)}
        .
      </p>
      {estimate ? (
        <p className="mt-1 text-xs text-zinc-400">
          At {estimate.grossLabel}, Stripe fees are ~{estimate.feeLabel} and payout is ~
          {estimate.netLabel}.
        </p>
      ) : draft.pricingMode === "PWYW" && draft.allowFreeCheckout ? (
        <p className="mt-1 text-xs text-zinc-400">
          Free checkout is enabled. Buyers can check out at {formatCurrency(0, currency)}.
        </p>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">
          Enter a price to preview Stripe fee and net payout.
        </p>
      )}
      {estimate?.belowFloor ? (
        <p className="mt-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          Price is below the minimum floor of {formatCurrency(minimumPriceFloorCents, currency)}.
        </p>
      ) : null}
    </>
  );
}
