"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { SMTP_PRESETS } from "@/lib/setup/smtp-presets";
import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";
import { StorageSettingsPanel } from "./setup-management-storage-panel";

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

type SmtpSettingsState = {
  smtpProviderPreset: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpSecure: boolean;
  smtpFromEmail: string;
  smtpTestRecipient: string;
  hasPassword: boolean;
  testPassed: boolean;
  lastTestedAt: string | null;
  lastTestError: string | null;
};

type SmtpSettingsResponse = {
  ok?: boolean;
  error?: string;
  data?: SmtpSettingsState;
  sentAt?: string;
  recipient?: string;
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
    serviceConnectivity: {
      database: {
        reachable: boolean;
        error: string | null;
      };
      redis: {
        reachable: boolean;
        error: string | null;
      };
      storage: {
        reachable: boolean;
        error: string | null;
        provider: "GARAGE" | "S3" | null;
        bucket: string | null;
      };
    };
    emailAndStorageMetrics: {
      recentFailedEmailCount: number;
      recentFailedEmailWindowDays: number;
      recentFailedEmailsSince: string;
      totalTrackAssetSizeBytes: number;
    };
    warnings: string[];
  };
};

type TranscodeStatusPayload = NonNullable<TranscodeStatusResponse["status"]>;

type SharedPanelProps = {
  panelCardClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
};

function formatBytes(sizeBytes: number | null | undefined) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimalPlaces = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimalPlaces)} ${units[unitIndex]}`;
}

function detectPresetFromSmtpSettings(state: Pick<SmtpSettingsState, "smtpHost" | "smtpPort" | "smtpSecure">) {
  const preset = SMTP_PRESETS.find(
    (entry) =>
      entry.host === state.smtpHost &&
      entry.port === state.smtpPort &&
      entry.secure === state.smtpSecure,
  );

  return preset?.id ?? "custom";
}

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

function SmtpSettingsPanel({
  panelCardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
}: SharedPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [providerPreset, setProviderPreset] = useState("custom");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpTestRecipient, setSmtpTestRecipient] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastTestError, setLastTestError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const smtpErrorId = "admin-smtp-settings-error";

  const selectedPreset =
    providerPreset === "custom"
      ? null
      : SMTP_PRESETS.find((item) => item.id === providerPreset) ?? null;

  const passwordHint = useMemo(() => {
    if (smtpPassword.trim().length > 0) {
      return "New password will be saved.";
    }

    if (hasPassword) {
      return "Password already saved. Leave blank to keep it.";
    }

    return "Enter SMTP password.";
  }, [hasPassword, smtpPassword]);

  const applyState = useCallback((state: SmtpSettingsState) => {
    const hasKnownPreset = SMTP_PRESETS.some((entry) => entry.id === state.smtpProviderPreset);
    const resolvedPreset =
      hasKnownPreset && state.smtpProviderPreset !== "custom"
        ? state.smtpProviderPreset
        : detectPresetFromSmtpSettings(state);

    setProviderPreset(resolvedPreset);
    setSmtpHost(state.smtpHost);
    setSmtpPort(String(state.smtpPort || 587));
    setSmtpUsername(state.smtpUsername);
    setSmtpSecure(state.smtpSecure);
    setSmtpFromEmail(state.smtpFromEmail);
    setSmtpTestRecipient(state.smtpTestRecipient);
    setHasPassword(state.hasPassword);
    setTestPassed(state.testPassed);
    setLastTestedAt(state.lastTestedAt);
    setLastTestError(state.lastTestError);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/settings/smtp", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as SmtpSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not load SMTP settings.");
      }

      applyState(body.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load SMTP settings.");
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = useCallback(async () => {
    const parsedPort = Number.parseInt(smtpPort, 10);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error("SMTP port must be between 1 and 65535.");
    }

    const response = await fetch("/api/admin/settings/smtp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        smtpProviderPreset: providerPreset,
        smtpHost,
        smtpPort: parsedPort,
        smtpUsername,
        smtpPassword,
        smtpSecure,
        smtpFromEmail,
        smtpTestRecipient,
      }),
    });
    const body = (await response.json().catch(() => null)) as SmtpSettingsResponse | null;
    if (!response.ok || !body?.ok || !body.data) {
      throw new Error(body?.error ?? "Could not save SMTP settings.");
    }

    setSmtpPassword("");
    applyState(body.data);
  }, [
    applyState,
    providerPreset,
    smtpFromEmail,
    smtpHost,
    smtpPassword,
    smtpPort,
    smtpSecure,
    smtpTestRecipient,
    smtpUsername,
  ]);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);

    try {
      await saveConfig();
      setNotice("SMTP settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save SMTP settings.");
    } finally {
      setSaving(false);
    }
  };

  const onSendTest = async () => {
    setError(null);
    setNotice(null);
    setTesting(true);

    try {
      await saveConfig();

      const response = await fetch("/api/admin/settings/smtp/test-email", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as SmtpSettingsResponse | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "SMTP test email failed.");
      }

      setTestPassed(true);
      setLastTestedAt(body.sentAt ?? new Date().toISOString());
      setLastTestError(null);
      setNotice(`Test email sent to ${body.recipient ?? smtpTestRecipient}.`);
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "SMTP test email failed.";
      setTestPassed(false);
      setLastTestError(message);
      setError(message);
    } finally {
      setTesting(false);
    }
  };

  const onProviderChange = (value: string) => {
    setProviderPreset(value);

    if (value === "custom") {
      return;
    }

    const preset = SMTP_PRESETS.find((item) => item.id === value);
    if (!preset) {
      return;
    }

    setSmtpHost(preset.host);
    setSmtpPort(String(preset.port));
    setSmtpSecure(preset.secure);
  };

  if (loading) {
    return (
      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">SMTP and Email</h3>
        <p className="mt-1 text-sm text-zinc-400">Loading SMTP settings...</p>
      </section>
    );
  }

  return (
    <section className={panelCardClassName}>
      <h3 className="text-xl font-semibold tracking-tight text-zinc-100">SMTP and Email</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Update provider credentials, sender defaults, and send a test email from admin settings.
      </p>

      {error ? (
        <div
          id={smtpErrorId}
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

      {lastTestError ? (
        <div className="mt-4 rounded-lg border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Last test error: {lastTestError}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-zinc-400">
        Status:{" "}
        <span className={testPassed ? "text-emerald-300" : "text-amber-300"}>
          {testPassed ? "Verified" : "Not verified"}
        </span>
        {lastTestedAt ? (
          <span className="ml-2 text-zinc-500">
            ({formatIsoTimestampForDisplay(lastTestedAt)})
          </span>
        ) : null}
      </div>

      <form onSubmit={onSave} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Email provider preset
          <select
            value={providerPreset}
            onChange={(event) => onProviderChange(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          >
            <option value="custom">Custom SMTP</option>
            {SMTP_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        {selectedPreset ? (
          <a
            href={selectedPreset.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
          >
            View {selectedPreset.label} setup guide
          </a>
        ) : null}

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          SMTP host
          <input
            required
            value={smtpHost}
            onChange={(event) => setSmtpHost(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          SMTP port
          <input
            required
            type="number"
            min={1}
            max={65535}
            value={smtpPort}
            onChange={(event) => setSmtpPort(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={smtpSecure}
            onChange={(event) => {
              const nextSecure = event.target.checked;
              setSmtpSecure(nextSecure);
              setSmtpPort(nextSecure ? "465" : "587");
            }}
          />
          Use TLS/SSL (`secure`)
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          SMTP username
          <input
            required
            value={smtpUsername}
            onChange={(event) => setSmtpUsername(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          SMTP password
          <input
            required={!hasPassword}
            type="password"
            value={smtpPassword}
            onChange={(event) => setSmtpPassword(event.target.value)}
            placeholder={hasPassword ? "Leave blank to keep saved password" : ""}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          />
        </label>
        <p className="text-xs text-zinc-500">{passwordHint}</p>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          From email
          <input
            required
            type="email"
            value={smtpFromEmail}
            onChange={(event) => setSmtpFromEmail(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Test recipient email
          <input
            required
            type="email"
            value={smtpTestRecipient}
            onChange={(event) => setSmtpTestRecipient(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? smtpErrorId : undefined}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving || testing} className={primaryButtonClassName}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={onSendTest}
            disabled={saving || testing}
            className={secondaryButtonClassName}
          >
            {testing ? "Sending..." : "Send Test Email"}
          </button>
        </div>
      </form>
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
      <SmtpSettingsPanel
        panelCardClassName={panelCardClassName}
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
      />
      <StorageSettingsPanel
        panelCardClassName={panelCardClassName}
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
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

      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Service Connectivity</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Reachability checks for database, Redis, and active object storage.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Database</p>
            <p
              className={`mt-1 text-sm ${
                status?.serviceConnectivity.database.reachable ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {status?.serviceConnectivity.database.reachable ? "Reachable" : "Unreachable"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Redis</p>
            <p
              className={`mt-1 text-sm ${
                status?.serviceConnectivity.redis.reachable ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {status?.serviceConnectivity.redis.reachable ? "Reachable" : "Unreachable"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Storage</p>
            <p
              className={`mt-1 text-sm ${
                status?.serviceConnectivity.storage.reachable ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {status?.serviceConnectivity.storage.reachable ? "Reachable" : "Unreachable"}
            </p>
            {status?.serviceConnectivity.storage.provider ? (
              <p className="mt-1 text-xs text-zinc-500">
                {status.serviceConnectivity.storage.provider}
                {status.serviceConnectivity.storage.bucket
                  ? ` · ${status.serviceConnectivity.storage.bucket}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>

        {status?.serviceConnectivity.redis.error || status?.serviceConnectivity.storage.error ? (
          <div className="mt-3 rounded-lg border border-amber-800/70 bg-amber-950/30 p-3 text-xs text-amber-200">
            {status.serviceConnectivity.redis.error ? (
              <p>Redis: {status.serviceConnectivity.redis.error}</p>
            ) : null}
            {status.serviceConnectivity.storage.error ? (
              <p className={status.serviceConnectivity.redis.error ? "mt-1" : ""}>
                Storage: {status.serviceConnectivity.storage.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">
          Email and Storage Metrics
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          Recent failed delivery count and database-derived asset usage.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Failed emails (last {status?.emailAndStorageMetrics.recentFailedEmailWindowDays ?? 7} days)
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              {status?.emailAndStorageMetrics.recentFailedEmailCount ?? 0}
            </p>
            <a
              href="/admin/orders?emailStatus=FAILED"
              className="mt-2 inline-flex text-xs text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
            >
              Open failed emails in Orders
            </a>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Track asset storage usage (DB)
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              {formatBytes(status?.emailAndStorageMetrics.totalTrackAssetSizeBytes)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {status?.emailAndStorageMetrics.totalTrackAssetSizeBytes ?? 0} bytes total
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
