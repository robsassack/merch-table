"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

type StripeSettingsState = {
  hasSecretKey: boolean;
  stripeWebhookSecret: string;
  webhookUrl: string;
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
};

type StripeSettingsResponse = {
  ok?: boolean;
  error?: string;
  data?: StripeSettingsState;
  verifiedAt?: string;
  message?: string;
};

type StoreStatus = "SETUP" | "PRIVATE" | "PUBLIC";

type StoreSettingsResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    contactEmail: string;
    storeStatus: StoreStatus;
  };
};

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

function ContactEmailForm() {
  const router = useRouter();
  const [contactEmail, setContactEmail] = useState("");
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("SETUP");
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contactErrorId = "admin-store-settings-error";
  const initialLoad = useRef(true);

  useEffect(() => {
    if (!initialLoad.current) return;
    initialLoad.current = false;

    fetch("/api/admin/settings/store", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: StoreSettingsResponse) => {
        if (body.ok && body.data) {
          setContactEmail(body.data.contactEmail);
          setStoreStatus(body.data.storeStatus);
        }
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
        body: JSON.stringify({ contactEmail }),
      });
      const body = (await response.json().catch(() => null)) as StoreSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not save store settings.");
      }
      setContactEmail(body.data.contactEmail);
      setStoreStatus(body.data.storeStatus);
      router.refresh();
      setNotice("Contact email saved.");
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

      setContactEmail(body.data.contactEmail);
      setStoreStatus(body.data.storeStatus);
      router.refresh();
      setNotice(
        body.data.storeStatus === "PUBLIC"
          ? "Store is now public."
          : "Store is now private.",
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Could not update store visibility.",
      );
    } finally {
      setSavingStatus(false);
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

  return (
    <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Store Settings</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Manage storefront visibility and buyer contact details.
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
            disabled={
              saving || savingStatus || (storeStatus !== "PRIVATE" && storeStatus !== "PUBLIC")
            }
            className={secondaryButtonClassName}
          >
            {savingStatus
              ? "Updating..."
              : storeIsPublic
                ? "Set Private"
                : "Set Public"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {storeIsPublic
            ? "Public: catalog and release pages are visible to visitors."
            : "Private: visitors are redirected to the maintenance page; buyer library routes stay available."}
        </p>
      </div>

      <form onSubmit={onSave} className="mt-4 flex flex-col gap-4">
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
        <div>
          <button
            type="submit"
            disabled={saving || savingStatus}
            className={primaryButtonClassName}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function SetupManagementPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [hasSecretKey, setHasSecretKey] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [webhookSecretRevealed, setWebhookSecretRevealed] = useState(false);
  const stripeErrorId = "admin-stripe-settings-error";

  const applyState = useCallback((state: StripeSettingsState) => {
    setHasSecretKey(state.hasSecretKey);
    setStripeWebhookSecret(state.stripeWebhookSecret);
    setWebhookUrl(state.webhookUrl);
    setVerified(state.verified);
    setVerifiedAt(state.verifiedAt);
    setLastError(state.lastError);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/settings/stripe", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as StripeSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not load Stripe settings.");
      }

      applyState(body.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Stripe settings.");
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);

    try {
      const response = await fetch("/api/admin/settings/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stripeSecretKey,
          stripeWebhookSecret,
        }),
      });
      const body = (await response.json().catch(() => null)) as StripeSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not save Stripe settings.");
      }

      setStripeSecretKey("");
      applyState(body.data);
      setWebhookSecretRevealed(false);
      setNotice("Stripe settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save Stripe settings.");
    } finally {
      setSaving(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setNotice(null);
    setVerifying(true);

    try {
      const saveResponse = await fetch("/api/admin/settings/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stripeSecretKey,
          stripeWebhookSecret,
        }),
      });
      const saveBody = (await saveResponse.json().catch(() => null)) as
        | StripeSettingsResponse
        | null;
      if (!saveResponse.ok || !saveBody?.ok || !saveBody.data) {
        throw new Error(saveBody?.error ?? "Could not save Stripe settings.");
      }

      setStripeSecretKey("");
      applyState(saveBody.data);
      setWebhookSecretRevealed(false);

      const verifyResponse = await fetch("/api/admin/settings/stripe/verify", {
        method: "POST",
      });
      const verifyBody = (await verifyResponse.json().catch(() => null)) as
        | StripeSettingsResponse
        | null;
      if (!verifyResponse.ok || !verifyBody?.ok) {
        throw new Error(verifyBody?.error ?? "Stripe verification failed.");
      }

      const verifiedTimestamp = verifyBody.verifiedAt ?? new Date().toISOString();
      setVerified(true);
      setVerifiedAt(verifiedTimestamp);
      setLastError(null);
      setNotice(verifyBody.message ?? "Stripe verification succeeded.");
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : "Stripe verification failed.";
      setVerified(false);
      setLastError(message);
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <>
        <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
          <p className="text-sm text-zinc-400">Loading Stripe settings...</p>
        </section>
        <ContactEmailForm />
      </>
    );
  }

  return (
    <>
    <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Setup</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Update Stripe credentials and verify connection from the admin workspace.
      </p>

      {error ? (
        <div
          id={stripeErrorId}
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

      {lastError ? (
        <div className="mt-4 rounded-lg border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Last verification error: {lastError}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Webhook URL</p>
        <code className="mt-2 block overflow-x-auto rounded bg-slate-950 px-3 py-2 text-xs text-zinc-300">
          {webhookUrl}
        </code>
      </div>

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Webhook Secret</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-slate-950 px-3 py-2 text-xs text-zinc-300">
            {stripeWebhookSecret
              ? webhookSecretRevealed
                ? stripeWebhookSecret
                : "whsec_••••••••••••••"
              : "Not set"}
          </code>
          <button
            type="button"
            onClick={() => setWebhookSecretRevealed((previous) => !previous)}
            className={secondaryButtonClassName}
            disabled={!stripeWebhookSecret || saving || verifying}
          >
            {webhookSecretRevealed ? "Hide" : "Reveal"}
          </button>
          <button
            type="button"
            onClick={() => {
              setWebhookSecretRevealed(false);
              setStripeWebhookSecret("");
              setVerified(false);
              setNotice("Webhook secret cleared. Paste a new one and save.");
            }}
            className={secondaryButtonClassName}
            disabled={saving || verifying}
          >
            Rotate
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-zinc-400">
        Status:{" "}
        <span className={verified ? "text-emerald-300" : "text-amber-300"}>
          {verified ? "Verified" : "Not verified"}
        </span>
        {verifiedAt ? (
          <span className="ml-2 text-zinc-500">
            ({formatIsoTimestampForDisplay(verifiedAt)})
          </span>
        ) : null}
      </div>

      <form onSubmit={onSave} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Stripe API key (secret key)
          <input
            type="password"
            value={stripeSecretKey}
            onChange={(event) => setStripeSecretKey(event.target.value)}
            placeholder={hasSecretKey ? "Leave blank to keep saved key" : "sk_live_..."}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? stripeErrorId : undefined}
          />
        </label>
        <p className="text-xs text-zinc-500">
          {hasSecretKey
            ? "Secret key is already saved. Leave blank to keep the existing key."
            : "No Stripe secret key saved yet."}
        </p>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Stripe webhook signing secret
          <input
            required
            type={webhookSecretRevealed ? "text" : "password"}
            value={stripeWebhookSecret}
            onChange={(event) => setStripeWebhookSecret(event.target.value)}
            placeholder="whsec_..."
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? stripeErrorId : undefined}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || verifying}
            className={primaryButtonClassName}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={onVerify}
            disabled={saving || verifying}
            className={secondaryButtonClassName}
          >
            {verifying ? "Verifying..." : "Verify Connection"}
          </button>
        </div>
      </form>
    </section>
    <ContactEmailForm />
    </>
  );
}
