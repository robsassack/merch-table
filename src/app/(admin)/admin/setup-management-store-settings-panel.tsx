"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { uploadReleaseCoverFile } from "./release-management/release-cover-upload";
import { StoreSettingsForm } from "./setup-management-store-settings-form";
import {
  centsToCurrencyInput,
  parseCurrencyInputToCents,
  parsePositiveInteger,
  refreshDocumentFavicon,
} from "./setup-management-store-settings-shared";
import type {
  PreviewMode,
  ReleaseDefaultArtist,
  ReleasePricingMode,
  ReleaseStatus,
  ReleaseType,
  StoreSettingsPanelProps,
  StoreSettingsResponse,
  StoreStatus,
} from "./setup-management-store-settings-shared";

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
  const [faviconVersion, setFaviconVersion] = useState<number | null>(null);
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
    setFaviconVersion(data.faviconVersion ?? null);
    setContactEmail(data.contactEmail);
    setAdminEmail(data.adminEmail);
    setCurrency(data.currency);
    setStoreStatus(data.storeStatus);
    setDefaultReleaseArtists(data.releaseDefaultArtists ?? []);
    setDefaultReleaseArtistId(data.defaultReleaseArtistId ?? "");
    setDefaultReleasePricingMode(data.defaultReleasePricingMode ?? "");
    setDefaultReleaseStatus(data.defaultReleaseStatus ?? "");
    setDefaultReleaseType(data.defaultReleaseType ?? "");
    setDefaultReleasePwywMinimum(
      centsToCurrencyInput(data.defaultReleasePwywMinimumCents, data.currency),
    );
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

    refreshDocumentFavicon(faviconVersion);
  }, [faviconVersion, isHydrated, organizationLogoUrl]);

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

    const parsedDefaultReleasePwywMinimum = parseCurrencyInputToCents(
      defaultReleasePwywMinimum,
      currency,
    );
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

      <StoreSettingsForm
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
        contactErrorId={contactErrorId}
        error={error}
        saving={saving}
        savingStatus={savingStatus}
        uploadingLogo={uploadingLogo}
        removingLogo={removingLogo}
        sendingAdminVerification={sendingAdminVerification}
        storeStatus={storeStatus}
        organizationLogoUrl={organizationLogoUrl}
        orgName={orgName}
        storeName={storeName}
        contactEmail={contactEmail}
        adminEmail={adminEmail}
        currency={currency}
        defaultReleaseArtists={defaultReleaseArtists}
        defaultReleaseArtistId={defaultReleaseArtistId}
        defaultReleasePricingMode={defaultReleasePricingMode}
        defaultReleaseStatus={defaultReleaseStatus}
        defaultReleaseType={defaultReleaseType}
        defaultReleasePwywMinimum={defaultReleasePwywMinimum}
        defaultReleaseAllowFreeCheckout={defaultReleaseAllowFreeCheckout}
        defaultPreviewMode={defaultPreviewMode}
        defaultPreviewSeconds={defaultPreviewSeconds}
        onSave={onSave}
        onToggleStoreVisibility={onToggleStoreVisibility}
        onOrganizationLogoFileChange={onOrganizationLogoFileChange}
        onRemoveOrganizationLogo={onRemoveOrganizationLogo}
        onSendAdminEmailVerification={onSendAdminEmailVerification}
        setOrgName={setOrgName}
        setStoreName={setStoreName}
        setContactEmail={setContactEmail}
        setAdminEmail={setAdminEmail}
        setCurrency={setCurrency}
        setDefaultReleaseArtistId={setDefaultReleaseArtistId}
        setDefaultReleasePricingMode={setDefaultReleasePricingMode}
        setDefaultReleaseStatus={setDefaultReleaseStatus}
        setDefaultReleaseType={setDefaultReleaseType}
        setDefaultReleasePwywMinimum={setDefaultReleasePwywMinimum}
        setDefaultReleaseAllowFreeCheckout={setDefaultReleaseAllowFreeCheckout}
        setDefaultPreviewMode={setDefaultPreviewMode}
        setDefaultPreviewSeconds={setDefaultPreviewSeconds}
      />
    </section>
  );
}
