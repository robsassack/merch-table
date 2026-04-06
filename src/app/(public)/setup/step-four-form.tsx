"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

import {
  setupContinueButtonClassName,
  setupPrimaryButtonClassName,
  setupSecondaryButtonClassName,
} from "./button-styles";

type StepFourInitialValues = {
  hasSecretKey: boolean;
  stripeWebhookSecret: string;
  webhookUrl: string;
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
};

type StepFourFormProps = {
  initialValues: StepFourInitialValues;
};

export function StepFourForm({ initialValues }: StepFourFormProps) {
  const router = useRouter();
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState(
    initialValues.stripeWebhookSecret,
  );
  const [hasSecretKey, setHasSecretKey] = useState(initialValues.hasSecretKey);
  const [verified, setVerified] = useState(initialValues.verified);
  const [verifiedAt, setVerifiedAt] = useState(initialValues.verifiedAt);
  const [lastError, setLastError] = useState(initialValues.lastError);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  const saveSettings = async () => {
    const response = await fetch("/api/setup/step-4", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stripeSecretKey,
        stripeWebhookSecret,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | {
          error?: string;
          data?: {
            hasSecretKey?: boolean;
            stripeWebhookSecret?: string;
            verified?: boolean;
            verifiedAt?: string | null;
            lastError?: string | null;
          };
        }
      | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Could not save Stripe settings.");
    }

    if (body?.data) {
      setHasSecretKey(Boolean(body.data.hasSecretKey));
      setStripeWebhookSecret(body.data.stripeWebhookSecret ?? "");
      setVerified(Boolean(body.data.verified));
      setVerifiedAt(body.data.verifiedAt ?? null);
      setLastError(body.data.lastError ?? null);
    }
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);

    try {
      await saveSettings();
      setStripeSecretKey("");
      setNotice("Stripe settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setNotice(null);
    setIsVerifying(true);

    try {
      await saveSettings();
      setStripeSecretKey("");

      const response = await fetch("/api/setup/step-4/verify", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; verifiedAt?: string; message?: string }
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Stripe verification failed.");
      }

      setVerified(true);
      setVerifiedAt(body.verifiedAt ?? new Date().toISOString());
      setLastError(null);
      setNotice(body.message ?? "Stripe verification succeeded.");
    } catch (verifyError) {
      const message =
        verifyError instanceof Error
          ? verifyError.message
          : "Stripe verification failed.";
      setVerified(false);
      setLastError(message);
      setError(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const onContinue = async () => {
    setError(null);
    setNotice(null);
    setIsContinuing(true);

    try {
      if (!verified) {
        throw new Error("Verify Stripe connection before moving to Step 5.");
      }

      router.push("/setup?step=5");
    } catch (continueError) {
      setError(
        continueError instanceof Error
          ? continueError.message
          : "Cannot continue without valid Stripe settings.",
      );
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <form onSubmit={onSave} className="step-enter mt-5 flex w-full max-w-xl flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Step 4: Stripe</h2>
      <p className="text-sm text-zinc-600">
        Need help? See Stripe docs for{" "}
        <a
          href="https://docs.stripe.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 underline"
        >
          API keys
        </a>{" "}
        and{" "}
        <a
          href="https://docs.stripe.com/webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 underline"
        >
          webhook setup
        </a>
        .
      </p>

      <div className="rounded border border-zinc-200 bg-white p-4">
        <p className="mb-1 text-sm font-medium text-zinc-700">Webhook URL</p>
        <p className="text-xs text-zinc-500">
          Use this exact endpoint in your Stripe dashboard webhook settings.
        </p>
        <code className="mt-2 block overflow-x-auto rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-800">
          {initialValues.webhookUrl}
        </code>
        <p className="mt-3 text-xs font-medium text-zinc-700">
          Required Stripe webhook events:
        </p>
        <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600">
          <li>
            <code>checkout.session.completed</code>
          </li>
          <li>
            <code>checkout.session.async_payment_succeeded</code>
          </li>
          <li>
            <code>checkout.session.async_payment_failed</code>
          </li>
        </ul>
      </div>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Stripe API key (secret key)
        <input
          type="password"
          value={stripeSecretKey}
          onChange={(event) => setStripeSecretKey(event.target.value)}
          placeholder={hasSecretKey ? "Leave blank to keep saved key" : "sk_live_..."}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>
      <p className="text-xs text-zinc-500">
        {hasSecretKey
          ? "Secret key already saved. Leave blank to keep it."
          : "Enter your Stripe secret key."}
      </p>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Stripe webhook signing secret
        <input
          required
          value={stripeWebhookSecret}
          onChange={(event) => setStripeWebhookSecret(event.target.value)}
          placeholder="whsec_..."
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <div className="mt-1 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isSaving || isVerifying || isContinuing}
            className={setupPrimaryButtonClassName}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>

          <button
            type="button"
            onClick={onVerify}
            disabled={isSaving || isVerifying || isContinuing}
            className={setupSecondaryButtonClassName}
          >
            {isVerifying ? "Verifying..." : "Verify Connection"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/setup?step=3")}
            className={setupSecondaryButtonClassName}
          >
            ← Back
          </button>

          <button
            type="button"
            onClick={onContinue}
            disabled={isSaving || isVerifying || isContinuing}
            className={setupContinueButtonClassName}
          >
            {isContinuing ? "Continuing..." : "Continue →"}
          </button>
        </div>
      </div>

      {verified ? (
        <p className="text-sm text-green-700">
          Stripe connection verified.
          {verifiedAt
            ? ` Last verified: ${formatIsoTimestampForDisplay(verifiedAt)}.`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-amber-700">
          Verify Stripe connection before moving to the next step.
        </p>
      )}

      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {lastError && !error ? (
        <p className="text-sm text-red-700">Last verification failed: {lastError}</p>
      ) : null}
    </form>
  );
}
