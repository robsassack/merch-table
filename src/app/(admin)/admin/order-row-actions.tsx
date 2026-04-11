"use client";

import { useEffect, useMemo, useState } from "react";

import type { EmailStatus, OrderStatus } from "@/generated/prisma/enums";
import { formatMinorAmount, getCurrencyMeta } from "@/lib/money";

import { AdminDialogPortal } from "./dialog-portal";

type OrderLibraryToken = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  accessCount: number;
};

export type OrderRowActionData = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  emailStatus: EmailStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  emailSentAt: string | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  customer: {
    email: string;
    name: string | null;
  };
  releases: string[];
  tokens: OrderLibraryToken[];
};

function formatAmount(cents: number, currency: string) {
  const code = getCurrencyMeta(currency).code;
  return `${formatMinorAmount(cents, code)} (${code})`;
}

function formatIso(iso: string | null) {
  if (!iso) {
    return "—";
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return parsed.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function buildStripeDashboardUrl(order: OrderRowActionData) {
  const query = order.paymentIntentId ?? order.checkoutSessionId ?? "";
  if (!query) {
    return null;
  }

  return `https://dashboard.stripe.com/search?query=${encodeURIComponent(query)}`;
}

function buildLibraryLinkFromToken(token: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.origin}/library#token=${encodeURIComponent(token)}`;
}

function isTokenArchived(token: OrderLibraryToken, nowMs: number) {
  if (token.revokedAt) {
    return true;
  }

  if (!token.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= nowMs;
}

type OrderActionResponse = {
  ok?: boolean;
  error?: string;
  libraryMagicLinkUrl?: string;
  refundStatus?: string | null;
};

async function parseActionResponse(response: Response): Promise<OrderActionResponse | null> {
  return (await response.json().catch(() => null)) as OrderActionResponse | null;
}

export function OrderRowActions({ order }: { order: OrderRowActionData }) {
  const [orderState, setOrderState] = useState<OrderRowActionData>(order);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<OrderLibraryToken[]>(order.tokens);
  const [showArchivedTokens, setShowArchivedTokens] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string>(
    (() => {
      const now = Date.now();
      return (
        order.tokens.find((token) => !isTokenArchived(token, now))?.id ?? order.tokens[0]?.id ?? ""
      );
    })(),
  );

  const stripeDashboardUrl = useMemo(() => buildStripeDashboardUrl(orderState), [orderState]);

  const activeTokens = useMemo(
    () => {
      const now = Date.now();
      return tokens.filter((token) => !isTokenArchived(token, now));
    },
    [tokens],
  );
  const archivedTokens = useMemo(
    () => {
      const now = Date.now();
      return tokens.filter((token) => isTokenArchived(token, now));
    },
    [tokens],
  );
  const visibleTokens = showArchivedTokens ? tokens : activeTokens;

  useEffect(() => {
    if (visibleTokens.length === 0) {
      if (selectedTokenId) {
        setSelectedTokenId("");
      }
      return;
    }

    const selectedStillVisible = visibleTokens.some((token) => token.id === selectedTokenId);
    if (!selectedStillVisible) {
      setSelectedTokenId(visibleTokens[0]?.id ?? "");
    }
  }, [visibleTokens, selectedTokenId]);

  const selectedToken = useMemo(
    () => visibleTokens.find((token) => token.id === selectedTokenId) ?? null,
    [visibleTokens, selectedTokenId],
  );

  const canRetryFailedEmail = orderState.emailStatus === "FAILED";
  const canRefund =
    orderState.totalCents > 0 &&
    orderState.status !== "REFUNDED" &&
    Boolean(orderState.paymentIntentId);
  const hasRevokeTarget = Boolean(selectedToken) && selectedToken?.revokedAt === null;
  const hasCopyTarget = Boolean(selectedToken);

  async function runAction(input: {
    body: Record<string, unknown>;
    pendingKey: string;
    successMessage: string;
  }) {
    setPendingAction(input.pendingKey);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderState.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.body),
      });

      const payload = await parseActionResponse(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error ?? "Could not process order action.");
      }

      setNotice(input.successMessage);

      if (input.body.action === "revoke-library-token" && selectedToken) {
        setTokens((previous) =>
          previous.map((token) =>
            token.id === selectedToken.id
              ? {
                  ...token,
                  revokedAt: new Date().toISOString(),
                }
              : token,
          ),
        );
      }

      if (payload.libraryMagicLinkUrl) {
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(payload.libraryMagicLinkUrl);
            setNotice(`${input.successMessage} Library link copied to clipboard.`);
          }
        } catch {
          // Clipboard write can fail in some browser contexts. Keep success notice.
        }
      }

      if (input.body.action === "refund-order" && payload.refundStatus === "succeeded") {
        setOrderState((previous) => ({
          ...previous,
          status: "REFUNDED",
        }));
      }

      if (input.body.action === "retry-email" || input.body.action === "resend-library-link") {
        setOrderState((previous) => ({
          ...previous,
          emailStatus: "SENT",
          emailSentAt: new Date().toISOString(),
        }));
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Could not process order action.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function onCopyLibraryLink() {
    if (!selectedToken) {
      setError("No library token selected.");
      setNotice(null);
      return;
    }

    const link = buildLibraryLinkFromToken(selectedToken.token);
    if (!link) {
      setError("Could not resolve library URL.");
      setNotice(null);
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(link);
      setError(null);
      setNotice("Library link copied to clipboard.");
    } catch (copyError) {
      setNotice(null);
      setError(copyError instanceof Error ? copyError.message : "Could not copy link.");
    }
  }

  async function onRefundOrder() {
    if (!canRefund) {
      return;
    }

    if (!window.confirm(`Issue a refund for ${orderState.orderNumber}?`)) {
      return;
    }

    await runAction({
      body: { action: "refund-order" },
      pendingKey: "refund",
      successMessage: "Refund request sent to Stripe.",
    });
  }

  async function onRetryFailedEmail() {
    if (!canRetryFailedEmail) {
      return;
    }

    await runAction({
      body: { action: "retry-email" },
      pendingKey: "retry-email",
      successMessage: "Retry email sent.",
    });
  }

  async function onResendLibraryLink() {
    await runAction({
      body: { action: "resend-library-link" },
      pendingKey: "resend-library-link",
      successMessage: "Library link email sent.",
    });
  }

  async function onRevokeToken() {
    if (!selectedToken || selectedToken.revokedAt) {
      return;
    }

    if (!window.confirm("Revoke the selected library token?")) {
      return;
    }

    await runAction({
      body: { action: "revoke-library-token", tokenId: selectedToken.id },
      pendingKey: "revoke-token",
      successMessage: "Token revoked.",
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setNotice(null);
          setIsOpen(true);
        }}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-600 px-2.5 text-xs font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800"
      >
        Actions
      </button>

      {isOpen ? (
        <AdminDialogPortal>
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
            role="dialog"
            aria-modal="true"
            aria-label={`Order actions for ${orderState.orderNumber}`}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-100">Order Actions</h3>
                    <p className="mt-1 text-sm text-zinc-400">{orderState.orderNumber}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={Boolean(pendingAction)}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-600 px-2.5 text-xs font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Close
                  </button>
                </div>

                {error ? (
                  <p className="mt-3 rounded-lg border border-rose-700/80 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                    {error}
                  </p>
                ) : null}
                {notice ? (
                  <p className="mt-3 rounded-lg border border-emerald-700/80 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
                    {notice}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Customer</p>
                    <p className="mt-1 text-sm text-zinc-100">{orderState.customer.email}</p>
                    {orderState.customer.name ? (
                      <p className="text-xs text-zinc-500">{orderState.customer.name}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total</p>
                    <p className="mt-1 text-sm text-zinc-100">
                      {formatAmount(orderState.totalCents, orderState.currency)}
                    </p>
                    <p className="text-xs text-zinc-500">{orderState.status}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Email</p>
                    <p className="mt-1 text-sm text-zinc-100">{orderState.emailStatus}</p>
                    <p className="text-xs text-zinc-500">
                      {orderState.emailSentAt
                        ? `Sent ${formatIso(orderState.emailSentAt)}`
                        : "Not sent"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void onRefundOrder()}
                    disabled={!canRefund || pendingAction !== null}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-700/70 bg-rose-950/40 px-3 text-sm font-medium text-rose-200 transition hover:border-rose-600 hover:bg-rose-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "refund" ? "Refunding..." : "Refund"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRetryFailedEmail()}
                    disabled={!canRetryFailedEmail || pendingAction !== null}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-700/70 bg-amber-950/40 px-3 text-sm font-medium text-amber-200 transition hover:border-amber-600 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "retry-email" ? "Retrying..." : "Retry Failed Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onResendLibraryLink()}
                    disabled={pendingAction !== null}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-500 px-3 text-sm font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "resend-library-link"
                      ? "Sending..."
                      : "Resend Library Link Email"}
                  </button>
                  {stripeDashboardUrl ? (
                    <a
                      href={stripeDashboardUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-500 px-3 text-sm font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800"
                    >
                      Open in Stripe
                    </a>
                  ) : (
                    <div className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-3 text-sm text-zinc-500">
                      Stripe reference unavailable
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Library Tokens</p>
                  {tokens.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="w-full text-xs text-zinc-500">
                        {activeTokens.length} active, {archivedTokens.length} archived
                      </p>
                      {archivedTokens.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowArchivedTokens((previous) => !previous)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-600 px-2.5 text-xs font-medium text-zinc-300 transition hover:border-slate-400 hover:bg-slate-800"
                        >
                          {showArchivedTokens ? "Hide archived" : "Show archived"}
                        </button>
                      ) : null}
                      <select
                        value={selectedTokenId}
                        onChange={(event) => setSelectedTokenId(event.target.value)}
                        disabled={visibleTokens.length === 0}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300"
                      >
                        {visibleTokens.length > 0 ? (
                          visibleTokens.map((token) => (
                            <option key={token.id} value={token.id}>
                              {token.id.slice(0, 10)}... ·{" "}
                              {isTokenArchived(token, Date.now()) ? "Archived" : "Active"} ·{" "}
                              {formatIso(token.createdAt)}
                            </option>
                          ))
                        ) : (
                          <option value="">
                            No active tokens
                          </option>
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() => void onCopyLibraryLink()}
                        disabled={!hasCopyTarget}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-500 px-3 text-sm font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Copy Library Link
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRevokeToken()}
                        disabled={!hasRevokeTarget || pendingAction !== null}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-700/70 bg-rose-950/40 px-3 text-sm font-medium text-rose-200 transition hover:border-rose-600 hover:bg-rose-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingAction === "revoke-token" ? "Revoking..." : "Revoke Token"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-400">No library tokens for this customer yet.</p>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Order Details</p>
                  <div className="mt-2 space-y-1 text-xs text-zinc-300">
                    <p>Created: {formatIso(orderState.createdAt)}</p>
                    <p>Paid: {formatIso(orderState.paidAt)}</p>
                    <p>Checkout Session: {orderState.checkoutSessionId ?? "—"}</p>
                    <p>Payment Intent: {orderState.paymentIntentId ?? "—"}</p>
                    <p>
                      Releases: {orderState.releases.length > 0 ? orderState.releases.join(", ") : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AdminDialogPortal>
      ) : null}
    </>
  );
}
