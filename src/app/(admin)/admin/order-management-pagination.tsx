import Link from "next/link";

const EMAIL_STATUS_OPTIONS = ["ALL", "PENDING", "SENT", "FAILED"] as const;

export type EmailStatusFilter = (typeof EMAIL_STATUS_OPTIONS)[number];

export { EMAIL_STATUS_OPTIONS };

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

export function PaginationControls({
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
