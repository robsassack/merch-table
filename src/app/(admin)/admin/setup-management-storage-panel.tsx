"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

type StorageAssetUsage = {
  trackAssetCount: number;
  releaseFileCount: number;
  releaseCoverImageCount: number;
  artistImageCount: number;
  organizationLogoCount: number;
  managedImageObjectCount: number;
  totalReferencedObjects: number;
  hasAssets: boolean;
};

type StorageRuntimeState = {
  provider: "GARAGE" | "S3" | null;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  error: string | null;
};

type StorageSettingsState = {
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
  runtimeStorage: StorageRuntimeState;
  assetUsage: StorageAssetUsage;
  migrationConfirmation: string;
};

type StorageSettingsResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  message?: string;
  validatedAt?: string;
  data?: StorageSettingsState;
  requiredConfirmation?: string;
  migration?: {
    copiedObjects: number;
    totalObjects: number;
    startedAt: string;
    finishedAt: string;
    message: string;
    runtimeProvider: "GARAGE" | "S3";
    targetProvider: "GARAGE" | "S3";
    runtimeSwitchPending: boolean;
  };
};

type StorageSettingsPanelProps = {
  panelCardClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
};

export function StorageSettingsPanel({
  panelCardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
}: StorageSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  const [storageMode, setStorageMode] = useState<"GARAGE" | "S3">("GARAGE");
  const [storageEndpoint, setStorageEndpoint] = useState("");
  const [storageRegion, setStorageRegion] = useState("us-east-1");
  const [storageBucket, setStorageBucket] = useState("media");
  const [storageAccessKeyId, setStorageAccessKeyId] = useState("");
  const [storageSecretAccessKey, setStorageSecretAccessKey] = useState("");
  const [storageUsePathStyle, setStorageUsePathStyle] = useState(true);
  const [hasSecretAccessKey, setHasSecretAccessKey] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [runtimeStorage, setRuntimeStorage] = useState<StorageRuntimeState>({
    provider: null,
    bucket: null,
    region: null,
    endpoint: null,
    error: null,
  });
  const [assetUsage, setAssetUsage] = useState<StorageAssetUsage>({
    trackAssetCount: 0,
    releaseFileCount: 0,
    releaseCoverImageCount: 0,
    artistImageCount: 0,
    organizationLogoCount: 0,
    managedImageObjectCount: 0,
    totalReferencedObjects: 0,
    hasAssets: false,
  });
  const [migrationConfirmation, setMigrationConfirmation] = useState("");
  const [migrationInput, setMigrationInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const storageErrorId = "admin-storage-settings-error";
  const externalMode = storageMode === "S3";
  const hasModeMismatch =
    runtimeStorage.provider !== null && runtimeStorage.provider !== storageMode;

  const applyState = useCallback((state: StorageSettingsState) => {
    setStorageMode(state.storageMode);
    setStorageEndpoint(state.storageEndpoint);
    setStorageRegion(state.storageRegion);
    setStorageBucket(state.storageBucket);
    setStorageAccessKeyId(state.storageAccessKeyId);
    setStorageUsePathStyle(state.storageUsePathStyle);
    setHasSecretAccessKey(state.hasSecretAccessKey);
    setValidated(state.validated);
    setValidatedAt(state.validatedAt);
    setLastError(state.lastError);
    setRuntimeStorage(state.runtimeStorage);
    setAssetUsage(state.assetUsage);
    setMigrationConfirmation(state.migrationConfirmation);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/settings/storage", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as StorageSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not load storage settings.");
      }

      applyState(body.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load storage settings.");
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildPayload = useCallback(() => {
    return {
      storageMode,
      storageEndpoint,
      storageRegion,
      storageBucket,
      storageAccessKeyId,
      storageSecretAccessKey,
      storageUsePathStyle,
    };
  }, [
    storageAccessKeyId,
    storageBucket,
    storageEndpoint,
    storageMode,
    storageRegion,
    storageSecretAccessKey,
    storageUsePathStyle,
  ]);

  const saveConfig = useCallback(async () => {
    const response = await fetch("/api/admin/settings/storage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });

    const body = (await response.json().catch(() => null)) as StorageSettingsResponse | null;
    if (!response.ok || !body?.ok || !body.data) {
      const fallback = response.status === 409
        ? "Storage mode switch is blocked until migration is completed."
        : "Could not save storage settings.";
      throw new Error(body?.error ?? fallback);
    }

    setStorageSecretAccessKey("");
    applyState(body.data);
  }, [applyState, buildPayload]);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setMigrationNotice(null);
    setSaving(true);

    try {
      await saveConfig();
      setNotice("Storage settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save storage settings.");
    } finally {
      setSaving(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setNotice(null);
    setMigrationNotice(null);
    setVerifying(true);

    try {
      await saveConfig();

      const response = await fetch("/api/admin/settings/storage/verify", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as StorageSettingsResponse | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Storage validation failed.");
      }

      setValidated(true);
      setValidatedAt(body.validatedAt ?? new Date().toISOString());
      setLastError(null);
      setNotice(body.message ?? "Storage validation succeeded.");
      await load();
    } catch (verifyError) {
      const message = verifyError instanceof Error ? verifyError.message : "Storage validation failed.";
      setValidated(false);
      setLastError(message);
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  const onRunMigration = async () => {
    setError(null);
    setNotice(null);
    setMigrationNotice(null);
    setMigrating(true);

    try {
      const response = await fetch("/api/admin/settings/storage/migrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          confirmation: migrationInput,
        }),
      });
      const body = (await response.json().catch(() => null)) as StorageSettingsResponse | null;
      if (!response.ok || !body?.ok || !body.data || !body.migration) {
        throw new Error(body?.error ?? "Storage migration failed.");
      }

      setStorageSecretAccessKey("");
      setMigrationInput("");
      applyState(body.data);
      const pendingHint = body.migration.runtimeSwitchPending
        ? " Runtime switch is pending: update storage env vars and restart services."
        : "";
      setMigrationNotice(`${body.migration.message}${pendingHint}`);
    } catch (migrationError) {
      setError(
        migrationError instanceof Error ? migrationError.message : "Storage migration failed.",
      );
    } finally {
      setMigrating(false);
    }
  };

  const passwordHint = useMemo(() => {
    if (storageSecretAccessKey.trim().length > 0) {
      return "New secret access key will be saved.";
    }

    if (hasSecretAccessKey) {
      return "Secret access key already saved. Leave blank to keep it.";
    }

    return "Enter secret access key.";
  }, [hasSecretAccessKey, storageSecretAccessKey]);

  if (loading) {
    return (
      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Storage</h3>
        <p className="mt-1 text-sm text-zinc-400">Loading storage settings...</p>
      </section>
    );
  }

  return (
    <section className={panelCardClassName}>
      <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Storage</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Manage provider settings, enforce safe mode-switch guardrails, and run guided migration when assets already exist.
      </p>

      {error ? (
        <div
          id={storageErrorId}
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

      {migrationNotice ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-blue-800/70 bg-blue-950/30 px-3 py-2 text-sm text-blue-200"
        >
          {migrationNotice}
        </div>
      ) : null}

      {lastError ? (
        <div className="mt-4 rounded-lg border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Last validation error: {lastError}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Configured mode</p>
          <p className="mt-1 text-sm text-zinc-200">{storageMode}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Runtime mode</p>
          <p className="mt-1 text-sm text-zinc-200">{runtimeStorage.provider ?? "Unavailable"}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-xs text-zinc-400">
        <p>
          Validation status:{" "}
          <span className={validated ? "text-emerald-300" : "text-amber-300"}>
            {validated ? "Validated" : "Not validated"}
          </span>
        </p>
        <p>Referenced storage objects: {assetUsage.totalReferencedObjects}</p>
        <p className="mt-1">
          Track assets: {assetUsage.trackAssetCount}, release files: {assetUsage.releaseFileCount}, managed images: {assetUsage.managedImageObjectCount}
        </p>
        <p className="mt-1">
          Runtime bucket: {runtimeStorage.bucket ?? "Unknown"} {runtimeStorage.region ? `(${runtimeStorage.region})` : ""}
        </p>
        {runtimeStorage.endpoint ? <p className="mt-1">Runtime endpoint: {runtimeStorage.endpoint}</p> : null}
        {runtimeStorage.error ? (
          <p className="mt-1 text-amber-300">Runtime config warning: {runtimeStorage.error}</p>
        ) : null}
        {validatedAt ? (
          <p className="mt-1">
            Last validation: {formatIsoTimestampForDisplay(validatedAt)}
          </p>
        ) : null}
      </div>

      {hasModeMismatch ? (
        <div className="mt-3 rounded-lg border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Configured mode differs from runtime mode. Update storage env vars and restart services to activate the configured provider.
        </div>
      ) : null}

      <form onSubmit={onSave} className="mt-4 flex flex-col gap-4">
        <div className="rounded border border-slate-700 bg-slate-900/60 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-200">Storage mode</p>
          <label className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="radio"
              name="storage-mode-admin"
              checked={storageMode === "GARAGE"}
              onChange={() => setStorageMode("GARAGE")}
            />
            Bundled Garage
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="radio"
              name="storage-mode-admin"
              checked={storageMode === "S3"}
              onChange={() => setStorageMode("S3")}
            />
            External S3-compatible storage
          </label>
        </div>

        {externalMode ? (
          <>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              S3 endpoint
              <input
                required
                value={storageEndpoint}
                onChange={(event) => setStorageEndpoint(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? storageErrorId : undefined}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              S3 region
              <input
                required
                value={storageRegion}
                onChange={(event) => setStorageRegion(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? storageErrorId : undefined}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Bucket
              <input
                required
                value={storageBucket}
                onChange={(event) => setStorageBucket(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? storageErrorId : undefined}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Access key ID
              <input
                required
                value={storageAccessKeyId}
                onChange={(event) => setStorageAccessKeyId(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? storageErrorId : undefined}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Secret access key
              <input
                required={!hasSecretAccessKey}
                type="password"
                value={storageSecretAccessKey}
                onChange={(event) => setStorageSecretAccessKey(event.target.value)}
                placeholder={hasSecretAccessKey ? "Leave blank to keep saved secret" : ""}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? storageErrorId : undefined}
              />
            </label>
            <p className="text-xs text-zinc-500">{passwordHint}</p>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={storageUsePathStyle}
                onChange={(event) => setStorageUsePathStyle(event.target.checked)}
              />
              Use path-style addressing
            </label>
          </>
        ) : (
          <p className="text-sm text-zinc-400">
            Bundled Garage uses local/default connection values.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving || verifying || migrating} className={primaryButtonClassName}>
            {saving ? "Saving..." : "Save"}
          </button>
          {externalMode ? (
            <button
              type="button"
              onClick={onVerify}
              disabled={saving || verifying || migrating}
              className={secondaryButtonClassName}
            >
              {verifying ? "Validating..." : "Validate Connection"}
            </button>
          ) : null}
        </div>
      </form>

      {assetUsage.hasAssets && hasModeMismatch ? (
        <div className="mt-5 rounded-lg border border-blue-800/70 bg-blue-950/20 p-4">
          <p className="text-sm font-medium text-blue-100">Guided Migration</p>
          <p className="mt-1 text-sm text-blue-200">
            Direct mode switching is blocked because {assetUsage.totalReferencedObjects} managed storage objects exist. Run migration to copy assets to the target provider.
          </p>
          <p className="mt-3 text-xs text-blue-300">
            Type <code>{migrationConfirmation}</code> to confirm.
          </p>
          <input
            value={migrationInput}
            onChange={(event) => setMigrationInput(event.target.value)}
            className="mt-2 w-full rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-2 text-sm text-blue-50 outline-none focus:border-blue-500"
            placeholder={migrationConfirmation}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? storageErrorId : undefined}
          />
          <div className="mt-3">
            <button
              type="button"
              onClick={onRunMigration}
              disabled={saving || verifying || migrating || migrationInput !== migrationConfirmation}
              className={secondaryButtonClassName}
            >
              {migrating ? "Migrating..." : "Run Migration"}
            </button>
          </div>
        </div>
      ) : null}

      {assetUsage.hasAssets && !hasModeMismatch ? (
        <div className="mt-4 rounded-lg border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Changing to a different storage mode will require guided migration because managed objects already exist.
        </div>
      ) : null}
    </section>
  );
}
