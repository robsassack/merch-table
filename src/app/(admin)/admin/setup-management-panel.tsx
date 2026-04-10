"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AdvancedPanel } from "./setup-management-advanced-panel";
import { IntegrationsPanel, StatusPanel } from "./setup-management-subpanels";
import { uploadReleaseCoverFile } from "./release-management/release-cover-upload";
import { SUPPORTED_CURRENCIES } from "@/lib/setup/currencies";

type StoreStatus = "SETUP" | "PRIVATE" | "PUBLIC";

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
  };
};

type SetupSection = "store" | "integrations" | "status" | "advanced";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const panelCardClassName = "rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6";

const setupSections: Array<{ id: SetupSection; label: string; description: string }> = [
  {
    id: "store",
    label: "Store",
    description: "Brand and storefront defaults",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Stripe, SMTP, and storage",
  },
  {
    id: "status",
    label: "Status",
    description: "Service and worker health",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Safety actions and reset",
  },
];

function parseSetupSection(value: string | null): SetupSection {
  return setupSections.some((section) => section.id === value)
    ? (value as SetupSection)
    : "store";
}

function resolveOrganizationLogoSrc(organizationLogoUrl: string | null) {
  if (!organizationLogoUrl) {
    return null;
  }

  return `/api/cover?url=${encodeURIComponent(organizationLogoUrl)}`;
}

function StoreSettingsPanel() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("SETUP");
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [sendingAdminVerification, setSendingAdminVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contactErrorId = "admin-store-settings-error";
  const initialLoad = useRef(true);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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

        setOrgName(body.data.orgName);
        setStoreName(body.data.storeName);
        setOrganizationLogoUrl(body.data.organizationLogoUrl);
        setContactEmail(body.data.contactEmail);
        setAdminEmail(body.data.adminEmail);
        setCurrency(body.data.currency);
        setStoreStatus(body.data.storeStatus);
      })
      .catch(() => undefined);
  }, []);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);

    try {
      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgName, storeName, contactEmail, adminEmail, currency }),
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not save store settings.");
      }
      setOrgName(body.data.orgName);
      setStoreName(body.data.storeName);
      setOrganizationLogoUrl(body.data.organizationLogoUrl);
      setContactEmail(body.data.contactEmail);
      setAdminEmail(body.data.adminEmail);
      setCurrency(body.data.currency);
      setStoreStatus(body.data.storeStatus);
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

      setOrgName(body.data.orgName);
      setStoreName(body.data.storeName);
      setOrganizationLogoUrl(body.data.organizationLogoUrl);
      setContactEmail(body.data.contactEmail);
      setAdminEmail(body.data.adminEmail);
      setCurrency(body.data.currency);
      setStoreStatus(body.data.storeStatus);
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

      setOrgName(body.data.orgName);
      setStoreName(body.data.storeName);
      setOrganizationLogoUrl(body.data.organizationLogoUrl);
      setContactEmail(body.data.contactEmail);
      setAdminEmail(body.data.adminEmail);
      setCurrency(body.data.currency);
      setStoreStatus(body.data.storeStatus);
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

      setOrgName(body.data.orgName);
      setStoreName(body.data.storeName);
      setOrganizationLogoUrl(body.data.organizationLogoUrl);
      setContactEmail(body.data.contactEmail);
      setAdminEmail(body.data.adminEmail);
      setCurrency(body.data.currency);
      setStoreStatus(body.data.storeStatus);
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
              <img
                src={resolveOrganizationLogoSrc(organizationLogoUrl) ?? ""}
                alt={`${orgName || "Organization"} logo`}
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

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Planned for Phase 9</p>
        <p className="mt-2 text-sm text-zinc-300">
          Additional account and role management will be added here as separate forms.
        </p>
      </div>
    </section>
  );
}

export function SetupManagementPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeSection = parseSetupSection(searchParams.get("section"));

  const activeSectionMeta = useMemo(
    () => setupSections.find((section) => section.id === activeSection) ?? setupSections[0],
    [activeSection],
  );

  const onSelectSection = useCallback(
    (section: SetupSection) => {
      if (section === activeSection) {
        return;
      }

      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (section === "store") {
        nextSearchParams.delete("section");
      } else {
        nextSearchParams.set("section", section);
      }

      const queryString = nextSearchParams.toString();
      router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [activeSection, pathname, router, searchParams],
  );

  return (
    <>
      <section className={panelCardClassName}>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Setup</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Phase 9 setup work is split into focused areas so each set of controls stays manageable.
        </p>

        <nav
          className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Setup sections"
          role="tablist"
        >
          {setupSections.map((section) => {
            const selected = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-current={selected ? "page" : undefined}
                onClick={() => onSelectSection(section.id)}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  selected
                    ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                    : "border-slate-700 bg-slate-900/70 text-zinc-300 hover:border-slate-500 hover:text-zinc-100"
                }`}
              >
                <p className="text-sm font-medium">{section.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{section.description}</p>
              </button>
            );
          })}
        </nav>

      </section>

      <div className="mt-4" role="tabpanel" aria-label={activeSectionMeta.label}>
        {activeSection === "store" ? <StoreSettingsPanel /> : null}
        {activeSection === "integrations" ? (
          <IntegrationsPanel
            panelCardClassName={panelCardClassName}
            primaryButtonClassName={primaryButtonClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
        {activeSection === "status" ? (
          <StatusPanel
            panelCardClassName={panelCardClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
        {activeSection === "advanced" ? (
          <AdvancedPanel
            panelCardClassName={panelCardClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}
      </div>
    </>
  );
}
