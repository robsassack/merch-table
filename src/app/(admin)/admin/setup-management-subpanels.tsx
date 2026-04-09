"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type TranscodeStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: {
    queueDepth: number | null;
    queuedJobs: number;
    runningJobs: number;
    workerUp: boolean;
    lastWorkerHeartbeatAt: string | null;
    workerStaleAfterSeconds: number;
    lastSuccessfulJobAt: string | null;
    checkedAt: string;
    warnings: string[];
  };
};

type TranscodeStatusPayload = NonNullable<TranscodeStatusResponse["status"]>;

type SharedPanelProps = {
  panelCardClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
};

function StripeSettingsPanel({
  panelCardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
}: SharedPanelProps) {
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
      const saveBody = (await saveResponse.json().catch(() => null)) as StripeSettingsResponse | null;
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
      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Stripe</h3>
        <p className="mt-1 text-sm text-zinc-400">Loading Stripe settings...</p>
      </section>
    );
  }

  return (
    <section className={panelCardClassName}>
      <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Stripe</h3>
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
          <span className="ml-2 text-zinc-500">({formatIsoTimestampForDisplay(verifiedAt)})</span>
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
          <button type="submit" disabled={saving || verifying} className={primaryButtonClassName}>
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
  );
}

type PhaseNinePlaceholderCardProps = {
  panelCardClassName: string;
  title: string;
  description: string;
};

function PhaseNinePlaceholderCard({
  panelCardClassName,
  title,
  description,
}: PhaseNinePlaceholderCardProps) {
  return (
    <section className={panelCardClassName}>
      <h3 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>
      <div className="mt-4 rounded-lg border border-dashed border-slate-600 bg-slate-900/80 p-4">
        <p className="text-sm text-zinc-300">Planned for Phase 9 implementation.</p>
      </div>
    </section>
  );
}

export function IntegrationsPanel({
  panelCardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
}: SharedPanelProps) {
  return (
    <div className="space-y-4">
      <StripeSettingsPanel
        panelCardClassName={panelCardClassName}
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
      />
      <PhaseNinePlaceholderCard
        panelCardClassName={panelCardClassName}
        title="SMTP and Email"
        description="SMTP provider credentials and sender defaults will be managed in this section."
      />
      <PhaseNinePlaceholderCard
        panelCardClassName={panelCardClassName}
        title="Storage"
        description="Storage mode updates and safety guardrails will live here, including migration flow options."
      />
    </div>
  );
}

export function StatusPanel({
  panelCardClassName,
  secondaryButtonClassName,
}: Pick<SharedPanelProps, "panelCardClassName" | "secondaryButtonClassName">) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TranscodeStatusPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/transcode-status", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as TranscodeStatusResponse | null;
      if (!response.ok || !body?.ok || !body.status) {
        throw new Error(body?.error ?? "Could not load status panel.");
      }

      setStatus(body.status);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Could not load status panel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workerStatusLabel = useMemo(() => {
    if (!status) {
      return "Unknown";
    }

    return status.workerUp ? "Connected" : "Disconnected";
  }, [status]);

  return (
    <div className="space-y-4">
      <section className={panelCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Worker Health</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Live transcode queue depth, worker heartbeat, and latest successful job.
            </p>
          </div>
          <button type="button" onClick={() => void load()} className={secondaryButtonClassName}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-800/70 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Worker</p>
            <p className={`mt-1 text-sm ${status?.workerUp ? "text-emerald-300" : "text-amber-300"}`}>
              {workerStatusLabel}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Queue depth (Redis)</p>
            <p className="mt-1 text-sm text-zinc-200">
              {status?.queueDepth === null || status?.queueDepth === undefined
                ? "Unavailable"
                : status.queueDepth}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Queued jobs (DB)</p>
            <p className="mt-1 text-sm text-zinc-200">{status?.queuedJobs ?? "-"}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Running jobs (DB)</p>
            <p className="mt-1 text-sm text-zinc-200">{status?.runningJobs ?? "-"}</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-xs text-zinc-400">
          <p>
            Last heartbeat:{" "}
            {status?.lastWorkerHeartbeatAt
              ? formatIsoTimestampForDisplay(status.lastWorkerHeartbeatAt)
              : "Unavailable"}
          </p>
          <p className="mt-1">
            Last successful job:{" "}
            {status?.lastSuccessfulJobAt
              ? formatIsoTimestampForDisplay(status.lastSuccessfulJobAt)
              : "Unavailable"}
          </p>
          <p className="mt-1">
            Checked at:{" "}
            {status?.checkedAt ? formatIsoTimestampForDisplay(status.checkedAt) : "Unavailable"}
          </p>
          {status?.warnings?.length ? (
            <p className="mt-2 text-amber-300">Warnings: {status.warnings.join(" ")}</p>
          ) : null}
        </div>
      </section>

      <PhaseNinePlaceholderCard
        panelCardClassName={panelCardClassName}
        title="Service Connectivity"
        description="Database, Redis, and storage reachability checks will appear here as explicit health rows."
      />

      <PhaseNinePlaceholderCard
        panelCardClassName={panelCardClassName}
        title="Email and Storage Metrics"
        description="Failed-email counts and database-derived storage usage totals will be added in this section."
      />
    </div>
  );
}
