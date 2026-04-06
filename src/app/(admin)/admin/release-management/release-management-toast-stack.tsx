"use client";

import { useEffect } from "react";

import { AdminDialogPortal } from "../dialog-portal";
import type { ReleaseManagementController } from "./use-release-management-controller";

const NOTICE_AUTO_DISMISS_MS = 6_000;
const ERROR_AUTO_DISMISS_MS = 10_000;

export function ReleaseManagementToastStack(props: {
  controller: ReleaseManagementController;
}) {
  const { notice, error, setNotice, setError } = props.controller;

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, NOTICE_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setError(null);
    }, ERROR_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timeout);
  }, [error, setError]);

  if (!notice && !error) {
    return null;
  }

  return (
    <AdminDialogPortal>
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3">
        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto w-full max-w-2xl rounded-xl border border-emerald-700/70 bg-emerald-950/90 px-3 py-2 text-sm text-emerald-100 shadow-xl backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <p>{notice}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="rounded border border-emerald-600/70 px-2 py-0.5 text-xs text-emerald-200 hover:bg-emerald-900/70"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="pointer-events-auto w-full max-w-2xl rounded-xl border border-rose-700/70 bg-rose-950/90 px-3 py-2 text-sm text-rose-100 shadow-xl backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded border border-rose-600/70 px-2 py-0.5 text-xs text-rose-200 hover:bg-rose-900/70"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AdminDialogPortal>
  );
}
