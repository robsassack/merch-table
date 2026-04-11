"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";
import { formatBytes, SharedPanelProps, TranscodeStatusPayload, TranscodeStatusResponse } from "./shared";

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
