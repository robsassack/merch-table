"use client";

import { useState } from "react";

import type { StoreStatus } from "@/generated/prisma/enums";

import { ArtistManagementPanel } from "./artist-management-panel";
import { AssetUploadPanel } from "./asset-upload-panel";

type AdminWorkspaceProps = {
  storeStatus: StoreStatus;
  storeName: string | null;
};

type AdminTab = "artists" | "assets";

const tabClassName =
  "inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition";

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

export function AdminWorkspace({ storeStatus, storeName }: AdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("artists");

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

        <div
          className="inline-flex rounded-xl border border-slate-700 bg-slate-900/70 p-1"
          role="tablist"
          aria-label="Admin sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "artists"}
            className={`${tabClassName} ${
              activeTab === "artists"
                ? "bg-slate-700 text-zinc-100"
                : "text-zinc-400 hover:bg-slate-800 hover:text-zinc-200"
            }`}
            onClick={() => setActiveTab("artists")}
          >
            Artists
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "assets"}
            className={`${tabClassName} ${
              activeTab === "assets"
                ? "bg-slate-700 text-zinc-100"
                : "text-zinc-400 hover:bg-slate-800 hover:text-zinc-200"
            }`}
            onClick={() => setActiveTab("assets")}
          >
            Assets
          </button>
        </div>
      </div>

      <div role="tabpanel" className="mt-4">
        {activeTab === "artists" ? <ArtistManagementPanel /> : <AssetUploadPanel />}
      </div>
    </>
  );
}
