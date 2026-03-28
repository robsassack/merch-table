"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SMTP_PRESETS } from "@/lib/setup/smtp-presets";

type StepTwoInitialValues = {
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

type StepTwoFormProps = {
  initialValues: StepTwoInitialValues;
};

const STEP_TWO_DRAFT_KEY = "setup-step-two-draft";

function detectPresetFromSmtpSettings(values: StepTwoInitialValues) {
  const matchedPreset = SMTP_PRESETS.find(
    (preset) =>
      preset.host === values.smtpHost &&
      preset.port === values.smtpPort &&
      preset.secure === values.smtpSecure,
  );

  return matchedPreset?.id ?? "custom";
}

export function StepTwoForm({ initialValues }: StepTwoFormProps) {
  const router = useRouter();
  const [providerPreset, setProviderPreset] = useState(() => {
    if (initialValues.smtpProviderPreset && initialValues.smtpProviderPreset !== "custom") {
      return initialValues.smtpProviderPreset;
    }

    return detectPresetFromSmtpSettings(initialValues);
  });
  const [smtpHost, setSmtpHost] = useState(initialValues.smtpHost);
  const [smtpPort, setSmtpPort] = useState(String(initialValues.smtpPort || 587));
  const [smtpUsername, setSmtpUsername] = useState(initialValues.smtpUsername);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(initialValues.smtpSecure);
  const [smtpFromEmail, setSmtpFromEmail] = useState(initialValues.smtpFromEmail);
  const [smtpTestRecipient, setSmtpTestRecipient] = useState(
    initialValues.smtpTestRecipient,
  );
  const [hasPassword, setHasPassword] = useState(initialValues.hasPassword);
  const [testPassed, setTestPassed] = useState(initialValues.testPassed);
  const [lastTestedAt, setLastTestedAt] = useState(initialValues.lastTestedAt);
  const [lastTestError, setLastTestError] = useState(initialValues.lastTestError);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedPreset =
    providerPreset === "custom"
      ? null
      : SMTP_PRESETS.find((item) => item.id === providerPreset) ?? null;

  const hasUnsavedPassword = smtpPassword.trim().length > 0;
  const passwordHint = useMemo(() => {
    if (hasUnsavedPassword) {
      return "New password will be saved.";
    }

    if (hasPassword) {
      return "Password already saved. Leave blank to keep it.";
    }

    return "Enter SMTP password.";
  }, [hasPassword, hasUnsavedPassword]);

  const saveConfig = async () => {
    const response = await fetch("/api/setup/step-2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        smtpProviderPreset: providerPreset,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        smtpSecure,
        smtpFromEmail,
        smtpTestRecipient,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; data?: StepTwoInitialValues }
      | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Could not save SMTP settings.");
    }

    if (body?.data) {
      setProviderPreset(body.data.smtpProviderPreset || "custom");
      setHasPassword(body.data.hasPassword);
      setTestPassed(body.data.testPassed);
      setLastTestedAt(body.data.lastTestedAt);
      setLastTestError(body.data.lastTestError);
    }
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);

    try {
      await saveConfig();
      setSmtpPassword("");
      setNotice("SMTP settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const onSendTest = async () => {
    setError(null);
    setNotice(null);
    setIsTesting(true);

    try {
      await saveConfig();
      setSmtpPassword("");

      const response = await fetch("/api/setup/step-2/test-email", {
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; sentAt?: string; recipient?: string }
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "SMTP test email failed.");
      }

      setTestPassed(true);
      setLastTestedAt(body.sentAt ?? new Date().toISOString());
      setLastTestError(null);
      setNotice(`Test email sent to ${body.recipient}.`);
    } catch (testError) {
      setTestPassed(false);
      setLastTestError(
        testError instanceof Error ? testError.message : "SMTP test email failed.",
      );
      setError(
        testError instanceof Error ? testError.message : "SMTP test email failed.",
      );
    } finally {
      setIsTesting(false);
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
    window.sessionStorage.setItem(
      STEP_TWO_DRAFT_KEY,
      JSON.stringify({
        providerPreset: value,
        smtpHost: preset.host,
        smtpPort: String(preset.port),
        smtpUsername,
        smtpSecure: preset.secure,
        smtpFromEmail,
        smtpTestRecipient,
      }),
    );
  };

  const persistDraft = useCallback(() => {
    window.sessionStorage.setItem(
      STEP_TWO_DRAFT_KEY,
      JSON.stringify({
        providerPreset,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpSecure,
        smtpFromEmail,
        smtpTestRecipient,
      }),
    );
  }, [
    providerPreset,
    smtpHost,
    smtpPort,
    smtpUsername,
    smtpSecure,
    smtpFromEmail,
    smtpTestRecipient,
  ]);

  useEffect(() => {
    try {
      const savedDraftRaw = window.sessionStorage.getItem(STEP_TWO_DRAFT_KEY);
      if (!savedDraftRaw) {
        return;
      }

      const savedDraft = JSON.parse(savedDraftRaw) as Partial<{
        providerPreset: string;
        smtpHost: string;
        smtpPort: string;
        smtpUsername: string;
        smtpSecure: boolean;
        smtpFromEmail: string;
        smtpTestRecipient: string;
      }>;

      if (savedDraft.providerPreset) {
        setProviderPreset(savedDraft.providerPreset);
      }
      if (savedDraft.smtpHost !== undefined) {
        setSmtpHost(savedDraft.smtpHost);
      }
      if (savedDraft.smtpPort !== undefined) {
        setSmtpPort(savedDraft.smtpPort);
      }
      if (savedDraft.smtpUsername !== undefined) {
        setSmtpUsername(savedDraft.smtpUsername);
      }
      if (savedDraft.smtpSecure !== undefined) {
        setSmtpSecure(savedDraft.smtpSecure);
      }
      if (savedDraft.smtpFromEmail !== undefined) {
        setSmtpFromEmail(savedDraft.smtpFromEmail);
      }
      if (savedDraft.smtpTestRecipient !== undefined) {
        setSmtpTestRecipient(savedDraft.smtpTestRecipient);
      }
    } catch {
      // Ignore invalid draft payloads.
    }
  }, []);

  useEffect(() => {
    persistDraft();
  }, [persistDraft]);

  return (
    <form onSubmit={onSave} className="flex w-full max-w-lg flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Step 2: Email Config</h2>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Email provider preset
        <select
          value={providerPreset}
          onChange={(event) => onProviderChange(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
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
          className="text-sm text-blue-700 underline"
        >
          View {selectedPreset.label} setup guide
        </a>
      ) : null}

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        SMTP host
        <input
          required
          value={smtpHost}
          onChange={(event) => setSmtpHost(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        SMTP port
        <input
          required
          type="number"
          min={1}
          max={65535}
          value={smtpPort}
          onChange={(event) => setSmtpPort(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
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

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        SMTP username
        <input
          required
          value={smtpUsername}
          onChange={(event) => setSmtpUsername(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        SMTP password
        <input
          type="password"
          value={smtpPassword}
          onChange={(event) => setSmtpPassword(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
          placeholder={hasPassword ? "Leave blank to keep saved password" : ""}
        />
      </label>
      <p className="text-xs text-zinc-500">{passwordHint}</p>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        From email
        <input
          required
          type="email"
          value={smtpFromEmail}
          onChange={(event) => setSmtpFromEmail(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Test recipient email
        <input
          required
          type="email"
          value={smtpTestRecipient}
          onChange={(event) => setSmtpTestRecipient(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || isTesting}
          className="inline-flex items-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save SMTP Settings"}
        </button>

        <button
          type="button"
          onClick={onSendTest}
          disabled={isSaving || isTesting}
          className="inline-flex items-center rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-60"
        >
          {isTesting ? "Testing..." : "Send Test Email"}
        </button>

        <button
          type="button"
          onClick={() => {
            persistDraft();
            router.push("/setup?step=1");
          }}
          className="inline-flex items-center rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900"
        >
          Back to Step 1
        </button>

        <button
          type="button"
          onClick={() => router.push("/setup?step=3")}
          disabled={!testPassed || isSaving || isTesting}
          className="inline-flex items-center rounded bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Continue to Step 3
        </button>
      </div>

      {testPassed ? (
        <p className="text-sm text-green-700">
          SMTP verified. You can continue to the next step.
          {lastTestedAt ? ` Last success: ${new Date(lastTestedAt).toLocaleString()}.` : ""}
        </p>
      ) : (
        <p className="text-sm text-amber-700">
          Step 2 requires a successful test email before proceeding.
        </p>
      )}

      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {lastTestError && !error ? (
        <p className="text-sm text-red-700">Last test failed: {lastTestError}</p>
      ) : null}
    </form>
  );
}
