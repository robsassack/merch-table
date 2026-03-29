"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type StepFiveInitialValues = {
  adminEmail: string;
  magicLinkSent: boolean;
  magicLinkSentAt: string | null;
  magicLinkLastError: string | null;
};

type StepFiveFormProps = {
  initialValues: StepFiveInitialValues;
};

type SaveStepFiveResponse = {
  error?: string;
  data?: StepFiveInitialValues;
};

type SendLinkResponse = {
  ok?: boolean;
  error?: string;
  adminEmail?: string;
  sentAt?: string;
  expiresAt?: string;
};

type BootstrapFallbackResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

export function StepFiveForm({ initialValues }: StepFiveFormProps) {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState(initialValues.adminEmail);
  const [magicLinkSent, setMagicLinkSent] = useState(initialValues.magicLinkSent);
  const [magicLinkSentAt, setMagicLinkSentAt] = useState(initialValues.magicLinkSentAt);
  const [magicLinkLastError, setMagicLinkLastError] = useState(
    initialValues.magicLinkLastError,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  const saveAdminEmail = async () => {
    const response = await fetch("/api/setup/step-5", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminEmail }),
    });

    const body = (await response.json().catch(() => null)) as SaveStepFiveResponse | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Could not save admin email.");
    }

    if (body?.data) {
      setAdminEmail(body.data.adminEmail);
      setMagicLinkSent(body.data.magicLinkSent);
      setMagicLinkSentAt(body.data.magicLinkSentAt);
      setMagicLinkLastError(body.data.magicLinkLastError);
      return body.data;
    }

    return null;
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);

    try {
      const state = await saveAdminEmail();
      setNotice("Admin email saved.");
      if (state) {
        setMagicLinkSent(state.magicLinkSent);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const onSendLink = async () => {
    setError(null);
    setNotice(null);
    setIsSending(true);

    try {
      await saveAdminEmail();

      const response = await fetch("/api/setup/step-5/send-link", { method: "POST" });
      const body = (await response.json().catch(() => null)) as SendLinkResponse | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Failed to send admin magic link.");
      }

      setMagicLinkSent(true);
      setMagicLinkSentAt(body.sentAt ?? new Date().toISOString());
      setMagicLinkLastError(null);
      setNotice(
        body.adminEmail
          ? `Magic link sent to ${body.adminEmail}.`
          : "Magic link sent to admin email.",
      );
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "Failed to send admin magic link.";
      setMagicLinkSent(false);
      setMagicLinkLastError(message);
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const onUseBootstrapFallback = async () => {
    setError(null);
    setNotice(null);
    setIsUsingFallback(true);

    try {
      await saveAdminEmail();

      const response = await fetch("/api/setup/step-5/bootstrap-fallback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bootstrapToken }),
      });
      const body = (await response.json().catch(() => null)) as
        | BootstrapFallbackResponse
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Could not complete fallback sign-in.");
      }

      router.push(body.redirectTo ?? "/admin");
      router.refresh();
    } catch (fallbackError) {
      setError(
        fallbackError instanceof Error
          ? fallbackError.message
          : "Could not complete fallback sign-in.",
      );
    } finally {
      setIsUsingFallback(false);
    }
  };

  return (
    <form onSubmit={onSave} className="flex w-full max-w-xl flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Step 5: Admin Account</h2>
      <p className="text-sm text-zinc-600">
        Enter the first admin email, then send a one-time magic link using your saved email
        configuration.
      </p>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Admin email
        <input
          required
          type="email"
          maxLength={320}
          value={adminEmail}
          onChange={(event) => setAdminEmail(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
          placeholder="admin@yourstore.com"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || isSending}
          className="inline-flex items-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Admin Email"}
        </button>

        <button
          type="button"
          onClick={onSendLink}
          disabled={isSaving || isSending}
          className="inline-flex items-center rounded bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send First Magic Link"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/setup?step=4")}
          className="inline-flex items-center rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900"
        >
          Back to Step 4
        </button>
      </div>

      {magicLinkSent ? (
        <p className="text-sm text-green-700">
          Admin magic link sent.
          {magicLinkSentAt
            ? ` Last sent: ${new Date(magicLinkSentAt).toLocaleString()}.`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-amber-700">
          Send and use the first magic link to complete admin setup.
        </p>
      )}

      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {magicLinkLastError && !error ? (
        <p className="text-sm text-red-700">Last send failed: {magicLinkLastError}</p>
      ) : null}

      <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-medium text-zinc-800">SMTP fallback</p>
        <p className="mt-1 text-xs text-zinc-600">
          If email delivery is failing, restart the server to print a fresh bootstrap
          token and use it here to complete setup.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={bootstrapToken}
            onChange={(event) => setBootstrapToken(event.target.value)}
            placeholder="Paste bootstrap token from server logs"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={onUseBootstrapFallback}
            disabled={isSaving || isSending || isUsingFallback}
            className="inline-flex items-center rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-60"
          >
            {isUsingFallback ? "Signing In..." : "Use Bootstrap Fallback"}
          </button>
        </div>
      </div>
    </form>
  );
}
