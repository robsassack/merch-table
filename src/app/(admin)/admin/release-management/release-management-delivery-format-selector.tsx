import { deliveryFormatOptions } from "./constants";
import type { DeliveryFormat, ReleaseDraft } from "./types";

export function ReleaseManagementDeliveryFormatSelector(props: {
  draft: ReleaseDraft;
  onToggleFormat: (format: DeliveryFormat, checked: boolean) => void;
}) {
  const { draft, onToggleFormat } = props;

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 md:col-span-2">
      <p className="font-medium text-zinc-300">Download formats</p>
      <p className="mt-1">Choose which transcode formats are available for buyer downloads.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {deliveryFormatOptions.map((formatOption) => {
          const checked = draft.deliveryFormats.includes(formatOption.value);

          return (
            <label key={formatOption.value} className="inline-flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onToggleFormat(formatOption.value, event.target.checked)}
              />
              <span>{formatOption.label}</span>
            </label>
          );
        })}
      </div>
      {draft.deliveryFormats.length === 0 ? (
        <p className="mt-2 text-xs text-amber-300">
          Select at least one delivery format before saving.
        </p>
      ) : null}
    </div>
  );
}
