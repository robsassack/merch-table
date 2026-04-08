import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import type { EmailStatus, OrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

const ORDER_PAGE_SIZE = 25;
const STATUS_CHIP_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none";
const EMAIL_STATUS_OPTIONS = ["ALL", "PENDING", "SENT", "FAILED"] as const;

type EmailStatusFilter = (typeof EMAIL_STATUS_OPTIONS)[number];

export type OrderManagementSearchParams = {
  page?: string | string[];
  emailStatus?: string | string[];
  q?: string | string[];
};

function formatAmount(cents: number, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${normalizedCurrency}`;
  }
}

function formatDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return formatIsoTimestampForDisplay(value.toISOString());
}

function getOrderStatusTone(status: OrderStatus) {
  switch (status) {
    case "PAID":
    case "FULFILLED":
      return "border-emerald-700/80 bg-emerald-950/50 text-emerald-300";
    case "PENDING":
      return "border-amber-700/80 bg-amber-950/50 text-amber-300";
    case "REFUNDED":
    case "CANCELED":
      return "border-zinc-700 bg-zinc-900/80 text-zinc-300";
    default:
      return "border-zinc-700 bg-zinc-900/80 text-zinc-300";
  }
}

function getEmailStatusTone(status: EmailStatus) {
  switch (status) {
    case "SENT":
      return "border-emerald-700/80 bg-emerald-950/50 text-emerald-300";
    case "FAILED":
      return "border-rose-700/80 bg-rose-950/50 text-rose-300";
    case "PENDING":
      return "border-amber-700/80 bg-amber-950/50 text-amber-300";
    default:
      return "border-zinc-700 bg-zinc-900/80 text-zinc-300";
  }
}

function summarizeOrderItems(items: Array<{ release: { title: string } }>) {
  const titles = Array.from(new Set(items.map((item) => item.release.title.trim()))).filter(
    (title) => title.length > 0,
  );

  if (titles.length === 0) {
    return "No release items";
  }

  return titles.join(", ");
}

function readSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

function parseEmailStatusFilter(rawValue: string): EmailStatusFilter {
  if (rawValue === "PENDING" || rawValue === "SENT" || rawValue === "FAILED") {
    return rawValue;
  }
  return "ALL";
}

function parsePage(rawValue: string) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function normalizeSearchQuery(rawValue: string) {
  return rawValue.trim().slice(0, 120);
}

function buildOrdersHref(input: {
  emailStatusFilter: EmailStatusFilter;
  searchQuery?: string;
  page?: number;
}) {
  const params = new URLSearchParams();

  if (input.emailStatusFilter !== "ALL") {
    params.set("emailStatus", input.emailStatusFilter);
  }

  if (input.searchQuery && input.searchQuery.length > 0) {
    params.set("q", input.searchQuery);
  }

  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }

  const query = params.toString();
  return query.length > 0 ? `/admin/orders?${query}` : "/admin/orders";
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push("ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < totalPages - 1) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);
  return pages;
}

function PaginationControls({
  currentPage,
  totalPages,
  emailStatusFilter,
  searchQuery,
}: {
  currentPage: number;
  totalPages: number;
  emailStatusFilter: EmailStatusFilter;
  searchQuery: string;
}) {
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  return (
    <div className="flex items-center gap-2">
      {currentPage > 1 ? (
        <Link
          href={buildOrdersHref({
            emailStatusFilter,
            searchQuery,
            page: currentPage - 1,
          })}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-3 text-sm font-medium text-zinc-300 transition hover:border-slate-500 hover:bg-slate-800"
        >
          Prev
        </Link>
      ) : null}
      {paginationItems.map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="inline-flex h-9 items-center justify-center px-2 text-sm text-zinc-500"
          >
            …
          </span>
        ) : (
          <Link
            key={`page-${item}`}
            href={buildOrdersHref({ emailStatusFilter, searchQuery, page: item })}
            aria-current={item === currentPage ? "page" : undefined}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${
              item === currentPage
                ? "border-slate-300 bg-slate-100 text-slate-900"
                : "border-slate-600 text-zinc-200 hover:border-slate-400 hover:bg-slate-800"
            }`}
          >
            {item}
          </Link>
        ),
      )}
      {currentPage < totalPages ? (
        <Link
          href={buildOrdersHref({
            emailStatusFilter,
            searchQuery,
            page: currentPage + 1,
          })}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-500 px-3 text-sm font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800"
        >
          Next
        </Link>
      ) : null}
    </div>
  );
}

export async function OrderManagementPanel({
  searchParams,
}: {
  searchParams?: OrderManagementSearchParams;
}) {
  const emailStatusFilter = parseEmailStatusFilter(
    readSingleParam(searchParams?.emailStatus).toUpperCase(),
  );
  const requestedPage = parsePage(readSingleParam(searchParams?.page));
  const searchQuery = normalizeSearchQuery(readSingleParam(searchParams?.q));

  const setup = await prisma.storeSettings
    .findFirst({
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    })
    .catch(() => null);

  if (!setup) {
    return (
      <section className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4 text-sm text-zinc-300">
        Orders are unavailable until store setup is complete.
      </section>
    );
  }

  const baseWhere: Prisma.OrderWhereInput = {
    organizationId: setup.organizationId,
    ...(emailStatusFilter !== "ALL" ? { emailStatus: emailStatusFilter } : {}),
    ...(searchQuery.length > 0
      ? {
          OR: [
            {
              orderNumber: {
                contains: searchQuery,
                mode: "insensitive",
              },
            },
            {
              customer: {
                is: {
                  email: {
                    contains: searchQuery,
                    mode: "insensitive",
                  },
                },
              },
            },
            {
              customer: {
                is: {
                  name: {
                    contains: searchQuery,
                    mode: "insensitive",
                  },
                },
              },
            },
            {
              items: {
                some: {
                  release: {
                    is: {
                      title: {
                        contains: searchQuery,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [filteredOrderCount, overallEmailStatusBreakdown] = await Promise.all([
    prisma.order.count({ where: baseWhere }).catch(() => 0),
    prisma.order
      .groupBy({
        by: ["emailStatus"],
        where: { organizationId: setup.organizationId },
        _count: { _all: true },
      })
      .catch(() => []),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredOrderCount / ORDER_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * ORDER_PAGE_SIZE;

  const visibleOrders = await prisma.order
    .findMany({
      where: baseWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: ORDER_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        emailStatus: true,
        emailSentAt: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        paidAt: true,
        customer: {
          select: {
            email: true,
            name: true,
          },
        },
        items: {
          orderBy: { lineNumber: "asc" },
          select: {
            release: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    })
    .catch(() => []);

  const emailStatusCounts: Record<EmailStatus, number> = {
    PENDING: 0,
    SENT: 0,
    FAILED: 0,
  };

  for (const row of overallEmailStatusBreakdown) {
    emailStatusCounts[row.emailStatus] = row._count._all;
  }

  const rangeStart = filteredOrderCount === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(filteredOrderCount, offset + visibleOrders.length);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Orders</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Recent purchases with delivery status for confirmation emails.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-900/60 p-3">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <label htmlFor="orders-search" className="text-xs text-zinc-400">
              Search
            </label>
            <input
              id="orders-search"
              name="q"
              type="search"
              defaultValue={searchQuery}
              placeholder="Order #, email, customer, release"
              className="h-9 min-w-60 rounded-lg border border-slate-600 bg-slate-950/80 px-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300"
            />
            <label htmlFor="orders-email-status" className="text-xs text-zinc-400">
              Email status
            </label>
            <select
              id="orders-email-status"
              name="emailStatus"
              defaultValue={emailStatusFilter}
              className="h-9 rounded-lg border border-slate-600 bg-slate-950/80 px-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300"
            >
              {EMAIL_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All" : option}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-500 px-3 text-sm font-medium text-zinc-200 transition hover:border-slate-400 hover:bg-slate-800"
            >
              Apply
            </button>
          </form>
          {emailStatusFilter !== "ALL" || currentPage > 1 || searchQuery.length > 0 ? (
            <Link
              href="/admin/orders"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-3 text-sm font-medium text-zinc-300 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Reset
            </Link>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Sent</p>
            <p className="mt-1 text-xl font-semibold text-emerald-300">{emailStatusCounts.SENT}</p>
          </div>
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Failed</p>
            <p className="mt-1 text-xl font-semibold text-rose-300">{emailStatusCounts.FAILED}</p>
          </div>
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Pending</p>
            <p className="mt-1 text-xl font-semibold text-amber-300">
              {emailStatusCounts.PENDING}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Showing {rangeStart}-{rangeEnd} of {filteredOrderCount} orders.
          </p>
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            emailStatusFilter={emailStatusFilter}
            searchQuery={searchQuery}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/60">
        {visibleOrders.length > 0 ? (
          <table className="min-w-full border-collapse">
            <thead className="border-b border-slate-700/80 bg-slate-900/70">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                <th scope="col" className="px-4 py-3 font-medium">
                  Order
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Release
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Order Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Email Delivery
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-800/80 align-top text-sm">
                  <td className="px-4 py-3 text-zinc-200">
                    <p className="font-medium">{order.orderNumber}</p>
                    {order.paidAt ? (
                      <p className="mt-1 text-xs text-zinc-500">Paid {formatDate(order.paidAt)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-200">
                    <p>{order.customer.email}</p>
                    {order.customer.name ? (
                      <p className="mt-1 text-xs text-zinc-500">{order.customer.name}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{summarizeOrderItems(order.items)}</td>
                  <td className="px-4 py-3 text-zinc-200">
                    {formatAmount(order.totalCents, order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`${STATUS_CHIP_BASE} ${getOrderStatusTone(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`${STATUS_CHIP_BASE} ${getEmailStatusTone(order.emailStatus)}`}
                    >
                      {order.emailStatus}
                    </span>
                    <p className="mt-1 text-xs text-zinc-500">
                      {order.emailStatus === "SENT"
                        ? `Sent ${formatDate(order.emailSentAt)}`
                        : order.emailStatus === "FAILED"
                          ? "Delivery failed"
                          : "Awaiting delivery"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-8 text-sm text-zinc-400">No orders yet.</div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Showing {rangeStart}-{rangeEnd} of {filteredOrderCount} orders.
        </p>
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          emailStatusFilter={emailStatusFilter}
          searchQuery={searchQuery}
        />
      </div>
    </section>
  );
}
