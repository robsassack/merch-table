"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

type AdvancedPanelResponse = {
  ok?: boolean;
  error?: string;
  requiredConfirmation?: string;
  redirectTo?: string;
  message?: string;
  data?: {
    factoryResetConfirmation: string;
    storeStatus: {
      setupComplete: boolean;
      storeStatus: "SETUP" | "PRIVATE" | "PUBLIC";
      updatedAt: string | null;
    };
    migrationHistory: Array<{
      id: string;
      status: string;
      sourceProvider: string;
      targetProvider: string;
      runtimeSwitchPending: boolean;
      totalObjects: number;
      copiedObjects: number;
      message: string | null;
      startedAt: string;
      finishedAt: string;
      initiatedByEmail: string;
    }>;
  };
};

export function AdvancedPanel({
  panelCardClassName,
  secondaryButtonClassName,
}: {
  panelCardClassName: string;
  secondaryButtonClassName: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [factoryResetConfirmation, setFactoryResetConfirmation] = useState("RESET STORE");
  const [factoryResetInput, setFactoryResetInput] = useState("");
  const [storeStatus, setStoreStatus] = useState<{
    setupComplete: boolean;
    storeStatus: "SETUP" | "PRIVATE" | "PUBLIC";
    updatedAt: string | null;
  }>({
    setupComplete: false,
    storeStatus: "SETUP",
    updatedAt: null,
  });
  const [migrationHistory, setMigrationHistory] = useState<
    Array<{
      id: string;
      status: string;
      sourceProvider: string;
      targetProvider: string;
      runtimeSwitchPending: boolean;
      totalObjects: number;
      copiedObjects: number;
      message: string | null;
      startedAt: string;
      finishedAt: string;
      initiatedByEmail: string;
    }>
  >([]);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/settings/advanced", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as AdvancedPanelResponse | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not load advanced settings.");
      }

      setFactoryResetConfirmation(body.data.factoryResetConfirmation);
      setStoreStatus(body.data.storeStatus);
      setMigrationHistory(body.data.migrationHistory);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load advanced settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canRunFactoryReset = useMemo(
    () => factoryResetInput === factoryResetConfirmation,
    [factoryResetConfirmation, factoryResetInput],
  );

  const onFactoryReset = async () => {
    setError(null);
    setNotice(null);
    setResetting(true);

    try {
      const response = await fetch("/api/admin/settings/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation: factoryResetInput,
        }),
      });
      const body = (await response.json().catch(() => null)) as AdvancedPanelResponse | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Factory reset failed.");
      }

      setNotice(body.message ?? "Factory reset started.");
      setFactoryResetInput("");
      router.push(body.redirectTo ?? "/setup");
      router.refresh();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Factory reset failed.");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Advanced</h3>
        <p className="mt-1 text-sm text-zinc-400">Loading advanced settings...</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-800/70 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-800/70 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
        >
          {notice}
        </div>
      ) : null}

      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Factory Reset</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Re-run setup without deleting catalog, order, or customer data. Storefront access is locked until setup completes again.
        </p>

        <div className="mt-4 rounded-lg border border-amber-800/70 bg-amber-950/30 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-300">Current Store Status</p>
          <p className="mt-1 text-sm text-amber-100">
            {storeStatus.setupComplete ? "Setup complete" : "Setup pending"} ({storeStatus.storeStatus})
          </p>
          {storeStatus.updatedAt ? (
            <p className="mt-1 text-xs text-amber-200/80">
              Last updated: {formatIsoTimestampForDisplay(storeStatus.updatedAt)}
            </p>
          ) : null}

          <p className="mt-3 text-xs text-amber-200">
            Type <code>{factoryResetConfirmation}</code> to confirm.
          </p>
          <input
            value={factoryResetInput}
            onChange={(event) => setFactoryResetInput(event.target.value)}
            className="mt-2 w-full rounded-lg border border-amber-700 bg-amber-950/20 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-500"
            placeholder={factoryResetConfirmation}
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            onClick={onFactoryReset}
            disabled={!canRunFactoryReset || resetting}
            className={`mt-3 ${secondaryButtonClassName}`}
          >
            {resetting ? "Resetting..." : "Run Factory Reset"}
          </button>
        </div>
      </section>

      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Storage Migration History</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Guided migration runs are executed in Integrations → Storage. This panel keeps a log of completed migration jobs.
        </p>
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
          {migrationHistory.length === 0 ? (
            <p className="text-sm text-zinc-300">No migration runs recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {migrationHistory.map((run) => (
                <li key={run.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-100">
                      {run.sourceProvider} -&gt; {run.targetProvider}
                    </p>
                    <p
                      className={`text-xs ${
                        run.status === "SUCCEEDED" ? "text-emerald-300" : "text-amber-300"
                      }`}
                    >
                      {run.status}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Copied {run.copiedObjects} of {run.totalObjects} objects
                    {run.runtimeSwitchPending ? " | runtime env switch pending" : ""}
                  </p>
                  {run.message ? (
                    <p className="mt-1 text-xs text-zinc-300">{run.message}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatIsoTimestampForDisplay(run.startedAt)} to{" "}
                    {formatIsoTimestampForDisplay(run.finishedAt)} by {run.initiatedByEmail}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className={`mt-3 ${secondaryButtonClassName}`}
            onClick={() => {
              router.push("/admin/setup?section=integrations");
            }}
          >
            Open Storage Settings
          </button>
        </div>
      </section>
    </div>
  );
}
