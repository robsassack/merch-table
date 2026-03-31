import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

import type { ReleaseManagementController } from "./use-release-management-controller";

function formatStatusTimestamp(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return formatIsoTimestampForDisplay(value);
}

function getWorkerStatusLabel(workerUp: boolean | null) {
  if (workerUp === null) {
    return "Unknown";
  }

  return workerUp ? "Up" : "Down";
}

function getWorkerStatusClassName(workerUp: boolean | null) {
  if (workerUp === null) {
    return "border-slate-700/70 bg-slate-900/60 text-zinc-300";
  }

  return workerUp
    ? "border-emerald-700/70 bg-emerald-950/40 text-emerald-300"
    : "border-rose-700/70 bg-rose-950/40 text-rose-300";
}

export function ReleaseManagementTasksCard(props: {
  controller: ReleaseManagementController;
}) {
  const { tasksLoading, tasksStatus, tasksError } = props.controller;

  return (
    <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-100">Tasks</p>
        {tasksLoading ? <p className="text-xs text-zinc-500">Checking…</p> : null}
      </div>

      {tasksError ? (
        <p className="mt-2 text-xs text-rose-300">{tasksError}</p>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
        <p>
          Queue depth (waiting):{" "}
          <span className="font-medium text-zinc-200">
            {typeof tasksStatus?.queueDepth === "number" ? tasksStatus.queueDepth : "n/a"}
          </span>
        </p>
        <p>
          Queued jobs:{" "}
          <span className="font-medium text-zinc-200">
            {tasksStatus?.queuedJobs ?? 0}
          </span>
        </p>
        <p>
          Running jobs:{" "}
          <span className="font-medium text-zinc-200">
            {tasksStatus?.runningJobs ?? 0}
          </span>
        </p>
        <p>
          Worker:{" "}
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getWorkerStatusClassName(tasksStatus?.workerUp ?? null)}`}
          >
            {getWorkerStatusLabel(tasksStatus?.workerUp ?? null)}
          </span>
        </p>
      </div>
      <div className="mt-2 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
        <p>
          Last success:{" "}
          <span className="font-medium text-zinc-200">
            {formatStatusTimestamp(tasksStatus?.lastSuccessfulJobAt ?? null)}
          </span>
        </p>
        <p>
          Last heartbeat:{" "}
          <span className="font-medium text-zinc-200">
            {formatStatusTimestamp(tasksStatus?.lastWorkerHeartbeatAt ?? null)}
          </span>
        </p>
      </div>

      {tasksStatus?.warnings?.length ? (
        <p className="mt-2 text-[11px] text-amber-300">
          {tasksStatus.warnings.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
