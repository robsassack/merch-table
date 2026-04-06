"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminDialogPortal } from "./dialog-portal";

type LogoutResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

export function AdminSignOutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirmSignOut = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      const body = (await response.json().catch(() => null)) as
        | LogoutResponse
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Could not sign out.");
      }

      setShowConfirmDialog(false);
      router.replace(body.redirectTo ?? "/admin/auth");
      router.refresh();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error ? logoutError.message : "Could not sign out.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowConfirmDialog(true)}
        disabled={isSubmitting}
        aria-label="Log out"
        title="Log out"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-zinc-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <span className="text-xs">...</span>
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        )}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {showConfirmDialog ? (
        <AdminDialogPortal>
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm admin sign out"
            onClick={() => {
              if (isSubmitting) {
                return;
              }
              setShowConfirmDialog(false);
            }}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-zinc-100">Sign out of admin?</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  You will be returned to the admin sign-in page.
                </p>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-rose-700 bg-rose-950 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void onConfirmSignOut()}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </AdminDialogPortal>
      ) : null}
    </div>
  );
}
