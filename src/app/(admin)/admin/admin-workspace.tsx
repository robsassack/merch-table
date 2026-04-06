import Link from "next/link";

import type { StoreStatus } from "@/generated/prisma/enums";

import { ArtistManagementPanel } from "./artist-management-panel";
import { ReleaseManagementPanel } from "./release-management-panel";
import { SetupManagementPanel } from "./setup-management-panel";

type AdminWorkspaceProps = {
  storeStatus: StoreStatus;
  storeName: string | null;
  activeTab: AdminTab;
};

export type AdminTab = "artists" | "releases" | "setup";

const tabClassName =
  "inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition sm:flex-none";

function getStatusStyle(status: StoreStatus) {
  if (status === "PUBLIC") {
    return "border-emerald-800/70 bg-emerald-950/60 text-emerald-300";
  }

  if (status === "PRIVATE") {
    return "border-amber-800/70 bg-amber-950/60 text-amber-300";
  }

  return "border-slate-700 bg-slate-900/70 text-zinc-300";
}

function getStatusLabel(status: StoreStatus) {
  if (status === "PUBLIC") {
    return "Public";
  }

  if (status === "PRIVATE") {
    return "Private";
  }

  return "Setup";
}

export function AdminWorkspace({ storeStatus, storeName, activeTab }: AdminWorkspaceProps) {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-950/50 p-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Store status</p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(storeStatus)}`}
            >
              {getStatusLabel(storeStatus)}
            </span>
            {storeName ? <p className="text-xs text-zinc-500">{storeName}</p> : null}
          </div>
        </div>

        <div className="flex w-full rounded-xl border border-slate-700 bg-slate-900/70 p-1 sm:inline-flex sm:w-auto">
          <Link
            href="/admin/artists"
            aria-current={activeTab === "artists" ? "page" : undefined}
            className={`${tabClassName} ${
              activeTab === "artists"
                ? "bg-slate-700 text-zinc-100"
                : "text-zinc-400 hover:bg-slate-800 hover:text-zinc-200"
            }`}
          >
            Artists
          </Link>
          <Link
            href="/admin/releases"
            aria-current={activeTab === "releases" ? "page" : undefined}
            className={`${tabClassName} ${
              activeTab === "releases"
                ? "bg-slate-700 text-zinc-100"
                : "text-zinc-400 hover:bg-slate-800 hover:text-zinc-200"
            }`}
          >
            Releases
          </Link>
          <Link
            href="/admin/setup"
            aria-current={activeTab === "setup" ? "page" : undefined}
            className={`${tabClassName} ${
              activeTab === "setup"
                ? "bg-slate-700 text-zinc-100"
                : "text-zinc-400 hover:bg-slate-800 hover:text-zinc-200"
            }`}
          >
            Setup
          </Link>
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "artists" ? <ArtistManagementPanel /> : null}
        {activeTab === "releases" ? <ReleaseManagementPanel /> : null}
        {activeTab === "setup" ? <SetupManagementPanel /> : null}
      </div>
    </>
  );
}
