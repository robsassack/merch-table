"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { uploadReleaseCoverFile } from "./release-management/release-cover-upload";
import { SUPPORTED_CURRENCIES } from "@/lib/setup/currencies";

type StoreStatus = "SETUP" | "PRIVATE" | "PUBLIC";
type ReleasePricingMode = "FREE" | "FIXED" | "PWYW";
type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type ReleaseType =
  | "ALBUM"
  | "EP"
  | "SINGLE"
  | "COMPILATION"
  | "MIXTAPE"
  | "LIVE_ALBUM"
  | "SOUNDTRACK_SCORE"
  | "DEMO"
  | "BOOTLEG"
  | "REMIX"
  | "OTHER";
type PreviewMode = "CLIP" | "FULL" | "NONE";

type ReleaseDefaultArtist = {
  id: string;
  name: string;
};

type StoreSettingsResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  message?: string;
  data?: {
    orgName: string;
    storeName: string;
    organizationLogoUrl: string | null;
    contactEmail: string;
    adminEmail: string;
    currency: string;
    storeStatus: StoreStatus;
    defaultReleaseArtistId: string | null;
    defaultReleasePricingMode: ReleasePricingMode | null;
    defaultReleaseStatus: ReleaseStatus | null;
    defaultReleaseType: ReleaseType | null;
    defaultReleasePwywMinimumCents: number | null;
    defaultReleaseAllowFreeCheckout: boolean | null;
    defaultPreviewMode: PreviewMode;
    defaultPreviewSeconds: number;
    releaseDefaultArtists: ReleaseDefaultArtist[];
  };
};

type StoreSettingsPanelProps = {
  panelCardClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
};

function resolveOrganizationLogoSrc(organizationLogoUrl: string) {
  return `/api/cover?url=${encodeURIComponent(organizationLogoUrl)}`;
}

const releasePricingModeOptions: Array<{ value: ReleasePricingMode; label: string }> = [
  { value: "FREE", label: "Free" },
  { value: "FIXED", label: "Fixed" },
  { value: "PWYW", label: "Pay What You Want" },
];

const releaseStatusOptions: Array<{ value: ReleaseStatus; label: string }> = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

const releaseTypeOptions: Array<{ value: ReleaseType; label: string }> = [
  { value: "ALBUM", label: "Album" },
  { value: "EP", label: "EP" },
  { value: "SINGLE", label: "Single" },
  { value: "COMPILATION", label: "Compilation" },
  { value: "MIXTAPE", label: "Mixtape" },
  { value: "LIVE_ALBUM", label: "Live Album" },
  { value: "SOUNDTRACK_SCORE", label: "Soundtrack / Score" },
  { value: "DEMO", label: "Demo" },
  { value: "BOOTLEG", label: "Bootleg" },
  { value: "REMIX", label: "Remix" },
  { value: "OTHER", label: "Other" },
];

function centsToCurrencyInput(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents < 0) {
    return "";
  }

  return (cents / 100).toFixed(2);
}

function parseCurrencyInputToCents(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function refreshDocumentFavicon() {
  if (typeof document === "undefined") {
    return;
  }

  const nextHref = `/favicon.ico?v=${Date.now()}`;
  const rels = ["icon", "shortcut icon", "apple-touch-icon"] as const;

  for (const rel of rels) {
    let linkElement = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
    if (!linkElement) {
      linkElement = document.createElement("link");
      linkElement.rel = rel;
      document.head.appendChild(linkElement);
    }
    linkElement.href = nextHref;
  }
}

export function StoreSettingsPanel({
  panelCardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
}: StoreSettingsPanelProps) {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("SETUP");
  const [defaultReleaseArtists, setDefaultReleaseArtists] = useState<ReleaseDefaultArtist[]>([]);
  const [defaultReleaseArtistId, setDefaultReleaseArtistId] = useState("");
  const [defaultReleasePricingMode, setDefaultReleasePricingMode] = useState<ReleasePricingMode | "">("");
  const [defaultReleaseStatus, setDefaultReleaseStatus] = useState<ReleaseStatus | "">("");
  const [defaultReleaseType, setDefaultReleaseType] = useState<ReleaseType | "">("");
  const [defaultReleasePwywMinimum, setDefaultReleasePwywMinimum] = useState("");
  const [defaultReleaseAllowFreeCheckout, setDefaultReleaseAllowFreeCheckout] = useState(false);
  const [defaultPreviewMode, setDefaultPreviewMode] = useState<PreviewMode>("CLIP");
  const [defaultPreviewSeconds, setDefaultPreviewSeconds] = useState("30");
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [sendingAdminVerification, setSendingAdminVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contactErrorId = "admin-store-settings-error";
  const initialLoad = useRef(true);

  const applyStoreSettingsData = (data: NonNullable<StoreSettingsResponse["data"]>) => {
    setOrgName(data.orgName);
    setStoreName(data.storeName);
    setOrganizationLogoUrl(data.organizationLogoUrl);
    setContactEmail(data.contactEmail);
    setAdminEmail(data.adminEmail);
    setCurrency(data.currency);
    setStoreStatus(data.storeStatus);
    setDefaultReleaseArtists(data.releaseDefaultArtists ?? []);
    setDefaultReleaseArtistId(data.defaultReleaseArtistId ?? "");
    setDefaultReleasePricingMode(data.defaultReleasePricingMode ?? "");
    setDefaultReleaseStatus(data.defaultReleaseStatus ?? "");
    setDefaultReleaseType(data.defaultReleaseType ?? "");
    setDefaultReleasePwywMinimum(centsToCurrencyInput(data.defaultReleasePwywMinimumCents));
    setDefaultReleaseAllowFreeCheckout(data.defaultReleaseAllowFreeCheckout ?? false);
    setDefaultPreviewMode(data.defaultPreviewMode ?? "CLIP");
    setDefaultPreviewSeconds(String(data.defaultPreviewSeconds ?? 30));
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    refreshDocumentFavicon();
  }, [isHydrated, organizationLogoUrl]);

  useEffect(() => {
    if (!initialLoad.current) {
      return;
    }

    initialLoad.current = false;

    fetch("/api/admin/settings/store", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: StoreSettingsResponse) => {
        if (!body.ok || !body.data) {
          return;
        }
        applyStoreSettingsData(body.data);
      })
      .catch(() => undefined);
  }, []);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const parsedDefaultReleasePwywMinimum = parseCurrencyInputToCents(defaultReleasePwywMinimum);
    if (defaultReleasePricingMode === "PWYW" && defaultReleasePwywMinimum.trim().length > 0 && parsedDefaultReleasePwywMinimum === null) {
      setError("Enter a valid PWYW minimum amount.");
      return;
    }

    const parsedDefaultPreviewSeconds = parsePositiveInteger(defaultPreviewSeconds);
    if (defaultPreviewMode === "CLIP" && parsedDefaultPreviewSeconds === null) {
      setError("Enter preview seconds as a whole number greater than 0.");
      return;
    }

    setSaving(true);

    try {
      const defaultReleasePwywMinimumCents =
        defaultReleasePricingMode === "PWYW"
          ? (parsedDefaultReleasePwywMinimum ??
            (defaultReleaseAllowFreeCheckout ? 0 : null))
          : null;

      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgName,
          storeName,
          contactEmail,
          adminEmail,
          currency,
          defaultReleaseArtistId: defaultReleaseArtistId.length > 0 ? defaultReleaseArtistId : null,
          defaultReleasePricingMode:
            defaultReleasePricingMode.length > 0 ? defaultReleasePricingMode : null,
          defaultReleaseStatus: defaultReleaseStatus.length > 0 ? defaultReleaseStatus : null,
          defaultReleaseType: defaultReleaseType.length > 0 ? defaultReleaseType : null,
          defaultReleasePwywMinimumCents,
          defaultReleaseAllowFreeCheckout:
            defaultReleasePricingMode === "PWYW" ? defaultReleaseAllowFreeCheckout : null,
          defaultPreviewMode,
          defaultPreviewSeconds:
            parsedDefaultPreviewSeconds ??
            parsePositiveInteger(defaultPreviewSeconds) ??
            30,
        }),
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not save store settings.");
      }
      applyStoreSettingsData(body.data);
      router.refresh();
      setNotice("Store settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save contact email.");
    } finally {
      setSaving(false);
    }
  };

  const onToggleStoreVisibility = async () => {
    if (storeStatus !== "PRIVATE" && storeStatus !== "PUBLIC") {
      return;
    }

    const nextStoreStatus = storeStatus === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    setError(null);
    setNotice(null);
    setSavingStatus(true);

    try {
      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeStatus: nextStoreStatus }),
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not update store visibility.");
      }
      applyStoreSettingsData(body.data);
      router.refresh();
      setNotice(body.data.storeStatus === "PUBLIC" ? "Store is now public." : "Store is now private.");
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Could not update store visibility.",
      );
    } finally {
      setSavingStatus(false);
    }
  };

  const onOrganizationLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setNotice(null);
    setUploadingLogo(true);

    try {
      const uploaded = await uploadReleaseCoverFile(file);
      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationLogoStorageKey: uploaded.storageKey }),
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not save organization logo.");
      }
      applyStoreSettingsData(body.data);
      router.refresh();
      setNotice("Organization logo uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload organization logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const onRemoveOrganizationLogo = async () => {
    setError(null);
    setNotice(null);
    setRemovingLogo(true);

    try {
      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationLogoStorageKey: null }),
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not remove organization logo.");
      }
      applyStoreSettingsData(body.data);
      router.refresh();
      setNotice("Organization logo removed.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove organization logo.");
    } finally {
      setRemovingLogo(false);
    }
  };

  const onSendAdminEmailVerification = async () => {
    setError(null);
    setNotice(null);
    setSendingAdminVerification(true);

    try {
      const response = await fetch("/api/admin/settings/admin-email/verify", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Could not send admin verification link.");
      }

      setNotice(body.message ?? "Verification link sent.");
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Could not send admin verification link.",
      );
    } finally {
      setSendingAdminVerification(false);
    }
  };

  const storeIsPublic = storeStatus === "PUBLIC";
  const storeStatusLabel =
    storeStatus === "PUBLIC" ? "Public" : storeStatus === "PRIVATE" ? "Private" : "Setup";
  const storeStatusToneClassName =
    storeStatus === "PUBLIC"
      ? "border-emerald-800/70 bg-emerald-950/60 text-emerald-300"
      : storeStatus === "PRIVATE"
        ? "border-amber-800/70 bg-amber-950/60 text-amber-300"
        : "border-slate-700 bg-slate-900/70 text-zinc-300";

  if (!isHydrated) {
    return (
      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Store Management</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Manage storefront visibility and buyer contact details.
        </p>
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
          <p className="text-sm text-zinc-400">Loading store settings...</p>
        </div>
      </section>
    );
  }

  return (
    <section className={panelCardClassName}>
      <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Store Management</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Manage organization details, storefront branding, visibility, and buyer contact details.
      </p>

      {error ? (
        <div
          id={contactErrorId}
          role="alert"
          className="mt-4 rounded-lg border border-red-800/70 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-800/70 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
        >
          {notice}
        </div>
      ) : null}

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
                    step="0.01"
                    inputMode="decimal"
                    value={defaultReleasePwywMinimum}
                    onChange={(event) => setDefaultReleasePwywMinimum(event.target.value)}
                    placeholder={defaultReleaseAllowFreeCheckout ? "0.00" : "2.00"}
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
                        setDefaultReleasePwywMinimum("0.00");
                      }
                    }}
                  />
                  Allow free checkout ($0)
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

    </section>
  );
}
