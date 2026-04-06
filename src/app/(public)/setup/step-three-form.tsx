"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

import {
  setupContinueButtonClassName,
  setupPrimaryButtonClassName,
  setupSecondaryButtonClassName,
} from "./button-styles";

type StepThreeInitialValues = {
  storageMode: "GARAGE" | "S3";
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKeyId: string;
  storageUsePathStyle: boolean;
  hasSecretAccessKey: boolean;
  validated: boolean;
  validatedAt: string | null;
  lastError: string | null;
};

type StepThreeFormProps = {
  initialValues: StepThreeInitialValues;
};

type SaveStepThreeResponse = {
  error?: string;
  data?: {
    hasSecretAccessKey?: boolean;
    validated?: boolean;
    validatedAt?: string | null;
    lastError?: string | null;
  };
};

type ValidateStepThreeResponse = {
  ok?: boolean;
  error?: string;
  validatedAt?: string;
  message?: string;
};

export function StepThreeForm({ initialValues }: StepThreeFormProps) {
  const router = useRouter();
  const [storageMode, setStorageMode] = useState<"GARAGE" | "S3">(
    initialValues.storageMode,
  );
  const [storageEndpoint, setStorageEndpoint] = useState(initialValues.storageEndpoint);
  const [storageRegion, setStorageRegion] = useState(initialValues.storageRegion);
  const [storageBucket, setStorageBucket] = useState(initialValues.storageBucket);
  const [storageAccessKeyId, setStorageAccessKeyId] = useState(
    initialValues.storageAccessKeyId,
  );
  const [storageSecretAccessKey, setStorageSecretAccessKey] = useState("");
  const [storageUsePathStyle, setStorageUsePathStyle] = useState(
    initialValues.storageUsePathStyle,
  );
  const [hasSecretAccessKey, setHasSecretAccessKey] = useState(
    initialValues.hasSecretAccessKey,
  );
  const [validated, setValidated] = useState(initialValues.validated);
  const [validatedAt, setValidatedAt] = useState(initialValues.validatedAt);
  const [lastError, setLastError] = useState(initialValues.lastError);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  const saveSettings = async () => {
    const response = await fetch("/api/setup/step-3", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storageMode,
        storageEndpoint,
        storageRegion,
        storageBucket,
        storageAccessKeyId,
        storageSecretAccessKey,
        storageUsePathStyle,
      }),
    });

    const responseText = await response.text();
    let body: SaveStepThreeResponse | null = null;

    try {
      body = JSON.parse(responseText) as SaveStepThreeResponse;
    } catch {
      body = null;
    }

    if (!response.ok) {
      throw new Error(
        body?.error ??
          (responseText
            ? `Could not save storage settings (${response.status}): ${responseText}`
            : `Could not save storage settings (${response.status}).`),
      );
    }

    if (body?.data) {
      setHasSecretAccessKey(Boolean(body.data.hasSecretAccessKey));
      setValidated(Boolean(body.data.validated));
      setValidatedAt(body.data.validatedAt ?? null);
      setLastError(body.data.lastError ?? null);
    }
  };

  const validateSettings = async () => {
    const response = await fetch("/api/setup/step-3/validate", { method: "POST" });
    const responseText = await response.text();
    let body: ValidateStepThreeResponse | null = null;

    try {
      body = JSON.parse(responseText) as ValidateStepThreeResponse;
    } catch {
      body = null;
    }

    if (!response.ok || !body?.ok) {
      throw new Error(
        body?.error ??
          (responseText
            ? `Storage validation failed (${response.status}): ${responseText}`
            : `Storage validation failed (${response.status}).`),
      );
    }

    setValidated(true);
    setValidatedAt(body.validatedAt ?? new Date().toISOString());
    setLastError(null);
    setNotice(body.message ?? "Storage validation succeeded.");
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);

    try {
      await saveSettings();
      setStorageSecretAccessKey("");
      setNotice("Storage settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const onValidate = async () => {
    setError(null);
    setNotice(null);
    setIsValidating(true);

    try {
      await saveSettings();
      await validateSettings();
      setStorageSecretAccessKey("");
    } catch (validationError) {
      setValidated(false);
      const message =
        validationError instanceof Error
          ? validationError.message
          : "Storage validation failed.";
      setLastError(message);
      setError(message);
    } finally {
      setIsValidating(false);
    }
  };

  const onContinue = async () => {
    setError(null);
    setNotice(null);
    setIsContinuing(true);

    try {
      await saveSettings();

      if (storageMode === "S3") {
        await validateSettings();
      }

      router.push("/setup?step=4");
    } catch (continueError) {
      const message =
        continueError instanceof Error
          ? continueError.message
          : "Cannot continue without valid storage settings.";
      setError(message);
    } finally {
      setIsContinuing(false);
    }
  };

  const externalMode = storageMode === "S3";

  return (
    <form onSubmit={onSave} className="step-enter mt-5 flex w-full max-w-xl flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Step 3: Storage</h2>

      <div className="rounded border border-zinc-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-zinc-700">Storage mode</p>
        <label className="mb-2 flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="radio"
            name="storage-mode"
            checked={storageMode === "GARAGE"}
            onChange={() => setStorageMode("GARAGE")}
          />
          Bundled Garage (default)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="radio"
            name="storage-mode"
            checked={storageMode === "S3"}
            onChange={() => setStorageMode("S3")}
          />
          External S3-compatible storage
        </label>
      </div>

      {externalMode ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            S3 endpoint
            <input
              required
              value={storageEndpoint}
              onChange={(event) => setStorageEndpoint(event.target.value)}
              placeholder="https://s3.us-east-1.amazonaws.com"
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            S3 region
            <input
              required
              value={storageRegion}
              onChange={(event) => setStorageRegion(event.target.value)}
              placeholder="us-east-1"
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Bucket
            <input
              required
              value={storageBucket}
              onChange={(event) => setStorageBucket(event.target.value)}
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Access key ID
            <input
              required
              value={storageAccessKeyId}
              onChange={(event) => setStorageAccessKeyId(event.target.value)}
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Secret access key
            <input
              type="password"
              value={storageSecretAccessKey}
              onChange={(event) => setStorageSecretAccessKey(event.target.value)}
              placeholder={
                hasSecretAccessKey ? "Leave blank to keep saved secret" : ""
              }
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </label>
          <p className="text-xs text-zinc-500">
            {hasSecretAccessKey
              ? "Secret already saved. Leave blank to keep it."
              : "Enter secret access key."}
          </p>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={storageUsePathStyle}
              onChange={(event) => setStorageUsePathStyle(event.target.checked)}
            />
            Use path-style addressing
          </label>
        </>
      ) : (
        <p className="text-sm text-zinc-600">
          Bundled Garage requires no additional credentials for setup.
        </p>
      )}

      <div className="mt-1 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isSaving || isValidating || isContinuing}
            className={setupPrimaryButtonClassName}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>

          {externalMode ? (
            <button
              type="button"
              onClick={onValidate}
              disabled={isSaving || isValidating || isContinuing}
              className={setupSecondaryButtonClassName}
            >
              {isValidating ? "Validating..." : "Validate Connection"}
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/setup?step=2")}
            className={setupSecondaryButtonClassName}
          >
            ← Back
          </button>

          <button
            type="button"
            onClick={onContinue}
            disabled={isSaving || isValidating || isContinuing}
            className={setupContinueButtonClassName}
          >
            {isContinuing ? "Continuing..." : "Continue →"}
          </button>
        </div>
      </div>

      {validated ? (
        <p className="text-sm text-green-700">
          Storage ready.
          {validatedAt
            ? ` Last validated: ${formatIsoTimestampForDisplay(validatedAt)}.`
            : ""}
        </p>
      ) : externalMode ? (
        <p className="text-sm text-amber-700">
          External S3 must validate successfully before proceeding.
        </p>
      ) : null}

      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {lastError && !error ? (
        <p className="text-sm text-red-700">Last validation failed: {lastError}</p>
      ) : null}
    </form>
  );
}
