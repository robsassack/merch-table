import type { ChangeEvent, FormEvent } from "react";
import Image from "next/image";

import {
  releasePricingModeOptions,
  releaseStatusOptions,
  releaseTypeOptions,
  resolveOrganizationLogoSrc,
} from "./setup-management-store-settings-shared";
import type {
  PreviewMode,
  ReleaseDefaultArtist,
  ReleasePricingMode,
  ReleaseStatus,
  ReleaseType,
  StoreStatus,
} from "./setup-management-store-settings-shared";
import { SUPPORTED_CURRENCIES } from "@/lib/setup/currencies";
import {
  formatMinorAmount,
  getCurrencyScale,
  inputModeForCurrency,
  minorToMajorInput,
  stepForCurrency,
} from "@/lib/money";

type StoreSettingsFormProps = {
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
  contactErrorId: string;
  error: string | null;
  saving: boolean;
  savingStatus: boolean;
  uploadingLogo: boolean;
  removingLogo: boolean;
  sendingAdminVerification: boolean;
  storeStatus: StoreStatus;
  organizationLogoUrl: string | null;
  orgName: string;
  storeName: string;
  contactEmail: string;
  adminEmail: string;
  currency: string;
  defaultReleaseArtists: ReleaseDefaultArtist[];
  defaultReleaseArtistId: string;
  defaultReleasePricingMode: ReleasePricingMode | "";
  defaultReleaseStatus: ReleaseStatus | "";
  defaultReleaseType: ReleaseType | "";
  defaultReleasePwywMinimum: string;
  defaultReleaseAllowFreeCheckout: boolean;
  defaultPreviewMode: PreviewMode;
  defaultPreviewSeconds: string;
  onSave: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onToggleStoreVisibility: () => void | Promise<void>;
  onOrganizationLogoFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemoveOrganizationLogo: () => void | Promise<void>;
  onSendAdminEmailVerification: () => void | Promise<void>;
  setOrgName: (value: string) => void;
  setStoreName: (value: string) => void;
  setContactEmail: (value: string) => void;
  setAdminEmail: (value: string) => void;
  setCurrency: (value: string) => void;
  setDefaultReleaseArtistId: (value: string) => void;
  setDefaultReleasePricingMode: (value: ReleasePricingMode | "") => void;
  setDefaultReleaseStatus: (value: ReleaseStatus | "") => void;
  setDefaultReleaseType: (value: ReleaseType | "") => void;
  setDefaultReleasePwywMinimum: (value: string) => void;
  setDefaultReleaseAllowFreeCheckout: (value: boolean) => void;
  setDefaultPreviewMode: (value: PreviewMode) => void;
  setDefaultPreviewSeconds: (value: string) => void;
};

export function StoreSettingsForm({
  primaryButtonClassName,
  secondaryButtonClassName,
  contactErrorId,
  error,
  saving,
  savingStatus,
  uploadingLogo,
  removingLogo,
  sendingAdminVerification,
  storeStatus,
  organizationLogoUrl,
  orgName,
  storeName,
  contactEmail,
  adminEmail,
  currency,
  defaultReleaseArtists,
  defaultReleaseArtistId,
  defaultReleasePricingMode,
  defaultReleaseStatus,
  defaultReleaseType,
  defaultReleasePwywMinimum,
  defaultReleaseAllowFreeCheckout,
  defaultPreviewMode,
  defaultPreviewSeconds,
  onSave,
  onToggleStoreVisibility,
  onOrganizationLogoFileChange,
  onRemoveOrganizationLogo,
  onSendAdminEmailVerification,
  setOrgName,
  setStoreName,
  setContactEmail,
  setAdminEmail,
  setCurrency,
  setDefaultReleaseArtistId,
  setDefaultReleasePricingMode,
  setDefaultReleaseStatus,
  setDefaultReleaseType,
  setDefaultReleasePwywMinimum,
  setDefaultReleaseAllowFreeCheckout,
  setDefaultPreviewMode,
  setDefaultPreviewSeconds,
}: StoreSettingsFormProps) {
  const storeIsPublic = storeStatus === "PUBLIC";
  const storeStatusLabel =
    storeStatus === "PUBLIC" ? "Public" : storeStatus === "PRIVATE" ? "Private" : "Setup";
  const storeStatusToneClassName =
    storeStatus === "PUBLIC"
      ? "border-emerald-800/70 bg-emerald-950/60 text-emerald-300"
      : storeStatus === "PRIVATE"
        ? "border-amber-800/70 bg-amber-950/60 text-amber-300"
        : "border-slate-700 bg-slate-900/70 text-zinc-300";

  return (
    <>
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Store visibility</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${storeStatusToneClassName}`}
          >
            {storeStatusLabel}
          </span>
          <button
            type="button"
            onClick={onToggleStoreVisibility}
            disabled={saving || savingStatus || (storeStatus !== "PRIVATE" && storeStatus !== "PUBLIC")}
            className={secondaryButtonClassName}
          >
            {savingStatus ? "Updating..." : storeIsPublic ? "Set Private" : "Set Public"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {storeIsPublic
            ? "Public: catalog and release pages are visible to visitors."
            : "Private: visitors are redirected to the maintenance page; buyer library routes stay available."}
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Organization logo</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
            {organizationLogoUrl ? (
              <Image
                src={resolveOrganizationLogoSrc(organizationLogoUrl)}
                alt={`${orgName || "Organization"} logo`}
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-zinc-500">No logo</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={secondaryButtonClassName}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                onChange={onOrganizationLogoFileChange}
                disabled={saving || savingStatus || uploadingLogo || removingLogo}
                className="sr-only"
              />
              {uploadingLogo ? "Uploading..." : organizationLogoUrl ? "Replace Logo" : "Upload Logo"}
            </label>
            <button
              type="button"
              onClick={onRemoveOrganizationLogo}
              disabled={!organizationLogoUrl || saving || savingStatus || uploadingLogo || removingLogo}
              className={secondaryButtonClassName}
            >
              {removingLogo ? "Removing..." : "Remove"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Accepted formats: JPEG, PNG, WEBP, AVIF, GIF.
        </p>
      </div>

      <form onSubmit={onSave} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Organization name
          <input
            type="text"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            placeholder="My Label LLC"
            required
            minLength={2}
            maxLength={120}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? contactErrorId : undefined}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Store name
          <input
            type="text"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            placeholder="My Artist Store"
            required
            minLength={2}
            maxLength={120}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? contactErrorId : undefined}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Contact email
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="you@example.com"
            required
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? contactErrorId : undefined}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Admin email
          <input
            type="email"
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
            placeholder="admin@example.com"
            required
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? contactErrorId : undefined}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSendAdminEmailVerification}
            disabled={saving || savingStatus || uploadingLogo || removingLogo || sendingAdminVerification}
            className={secondaryButtonClassName}
          >
            {sendingAdminVerification ? "Sending verification..." : "Send Verification Link"}
          </button>
          <p className="text-xs text-zinc-500">
            Required before changing admin email.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Currency
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? contactErrorId : undefined}
          >
            {SUPPORTED_CURRENCIES.map((supportedCurrency) => (
              <option key={supportedCurrency.code} value={supportedCurrency.code}>
                {supportedCurrency.flag} {supportedCurrency.code} ({supportedCurrency.symbol}) -{" "}
                {supportedCurrency.name}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Release Defaults</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Artist
              <select
                value={defaultReleaseArtistId}
                onChange={(event) => setDefaultReleaseArtistId(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
              >
                <option value="">No default artist</option>
                {defaultReleaseArtists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Pricing mode
              <select
                value={defaultReleasePricingMode}
                onChange={(event) => {
                  const nextMode = event.target.value as ReleasePricingMode | "";
                  setDefaultReleasePricingMode(nextMode);
                  if (nextMode !== "PWYW") {
                    setDefaultReleaseAllowFreeCheckout(false);
                  }
                }}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
              >
                <option value="">No default pricing mode</option>
                {releasePricingModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Status
              <select
                value={defaultReleaseStatus}
                onChange={(event) => setDefaultReleaseStatus(event.target.value as ReleaseStatus | "")}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
              >
                <option value="">No default status</option>
                {releaseStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Type
              <select
                value={defaultReleaseType}
                onChange={(event) => setDefaultReleaseType(event.target.value as ReleaseType | "")}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
              >
                <option value="">No default type</option>
                {releaseTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {defaultReleasePricingMode === "PWYW" ? (
              <div className="flex flex-col gap-2 text-sm text-zinc-300 md:col-span-2">
                <label className="flex flex-col gap-1">
                  PWYW minimum ({currency})
                  <input
                    type="number"
                    min="0"
                    step={stepForCurrency(currency)}
                    inputMode={inputModeForCurrency(currency)}
                    value={defaultReleasePwywMinimum}
                    onChange={(event) => setDefaultReleasePwywMinimum(event.target.value)}
                    placeholder={
                      defaultReleaseAllowFreeCheckout
                        ? minorToMajorInput(0, currency)
                        : minorToMajorInput(2 * getCurrencyScale(currency), currency)
                    }
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={defaultReleaseAllowFreeCheckout}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setDefaultReleaseAllowFreeCheckout(checked);
                      if (checked && defaultReleasePwywMinimum.trim().length === 0) {
                        setDefaultReleasePwywMinimum(minorToMajorInput(0, currency));
                      }
                    }}
                  />
                  {`Allow free checkout (${formatMinorAmount(0, currency)})`}
                </label>
              </div>
            ) : null}

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Release preview mode
              <select
                value={defaultPreviewMode}
                onChange={(event) => setDefaultPreviewMode(event.target.value as PreviewMode)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
              >
                <option value="CLIP">Clip</option>
                <option value="FULL">Full</option>
                <option value="NONE">No Preview</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Release preview seconds
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={defaultPreviewSeconds}
                onChange={(event) => setDefaultPreviewSeconds(event.target.value)}
                placeholder="30"
                disabled={defaultPreviewMode !== "CLIP"}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600 disabled:opacity-50"
              />
            </label>
          </div>
        </div>
        <div>
          <button
            type="submit"
            disabled={saving || savingStatus || uploadingLogo || removingLogo}
            className={primaryButtonClassName}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </>
  );
}
