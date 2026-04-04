"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { buyerTheme, resolveBrandGlyph } from "@/app/buyer-theme";

type DownloadFormat = "mp3" | "m4a" | "flac";

type LibraryDownload = {
  downloadPath: string;
  fileName: string;
  format: DownloadFormat | null;
  release: {
    id: string;
    title: string;
    coverImageUrl: string | null;
    artistName: string;
  };
};

type LibrarySuccessPayload = {
  ok: true;
  availableDownloadFormatsByReleaseId: Record<string, DownloadFormat[]>;
  downloads: LibraryDownload[];
};

type LibraryReleaseGroup = {
  id: string;
  title: string;
  artistName: string;
  coverImageUrl: string | null;
  downloads: LibraryDownload[];
  availableFormats: DownloadFormat[];
  zipFormat: DownloadFormat | null;
};

type LibraryState = "idle" | "loading" | "ready" | "error";

type LibraryPageClientProps = {
  brandLabel: string;
};

function normalizeToken(value: string) {
  return value.trim();
}

function formatLabel(format: DownloadFormat) {
  return format.toUpperCase();
}

function describeFormats(formats: DownloadFormat[]) {
  if (formats.length === 0) {
    return "No formats";
  }
  return formats.map((format) => formatLabel(format)).join(", ");
}

function toTrackDisplay(fileName: string) {
  const extIndex = fileName.lastIndexOf(".");
  const noExt = extIndex > 0 ? fileName.slice(0, extIndex) : fileName;
  const match = noExt.match(/^(\d{1,2})\s*-\s*(.+)$/);
  if (!match) {
    return { number: "--", title: noExt };
  }
  return {
    number: match[1].padStart(2, "0"),
    title: match[2],
  };
}

function extractTokenFromWindow() {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get("token")?.trim();
  if (queryToken) {
    return queryToken;
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get("token")?.trim() ?? "";
}

function writeTokenToHash(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("token");
  url.hash = token ? `token=${encodeURIComponent(token)}` : "";
  window.history.replaceState(null, "", url.toString());
}

function chooseZipFormat(formats: DownloadFormat[]) {
  if (formats.includes("flac")) {
    return "flac";
  }
  if (formats.includes("m4a")) {
    return "m4a";
  }
  if (formats.includes("mp3")) {
    return "mp3";
  }
  return null;
}

function resolveCoverSrc(coverImageUrl: string | null) {
  if (!coverImageUrl) {
    return null;
  }
  return `/api/cover?url=${encodeURIComponent(coverImageUrl)}`;
}

function groupDownloadsByRelease(payload: LibrarySuccessPayload): LibraryReleaseGroup[] {
  const groups = new Map<string, LibraryReleaseGroup>();

  for (const download of payload.downloads) {
    const releaseId = download.release.id;
    const existing = groups.get(releaseId);
    if (existing) {
      existing.downloads.push(download);
      continue;
    }

    const availableFormats = payload.availableDownloadFormatsByReleaseId[releaseId] ?? [];
    groups.set(releaseId, {
      id: releaseId,
      title: download.release.title,
      artistName: download.release.artistName,
      coverImageUrl: download.release.coverImageUrl,
      downloads: [download],
      availableFormats,
      zipFormat: chooseZipFormat(availableFormats),
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    downloads: [...group.downloads].sort((a, b) => a.fileName.localeCompare(b.fileName)),
  }));
}

export default function LibraryPageClient({ brandLabel }: LibraryPageClientProps) {
  const brandGlyph = resolveBrandGlyph(brandLabel);
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [state, setState] = useState<LibraryState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibrarySuccessPayload | null>(null);

  useEffect(() => {
    const applyTokenFromUrl = () => {
      const nextToken = normalizeToken(extractTokenFromWindow());
      setToken(nextToken);
      setTokenInput(nextToken);
      if (!nextToken) {
        setState("idle");
        setErrorMessage(null);
        setLibrary(null);
      }
    };

    applyTokenFromUrl();
    window.addEventListener("hashchange", applyTokenFromUrl);
    return () => {
      window.removeEventListener("hashchange", applyTokenFromUrl);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();

    async function loadLibrary() {
      setState("loading");
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/library/${encodeURIComponent(token)}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => null)) as
          | (LibrarySuccessPayload & { ok: true })
          | { ok: false; error?: string }
          | null;

        if (!response.ok || !payload || payload.ok !== true) {
          const payloadError =
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : null;
          setLibrary(null);
          setState("error");
          setErrorMessage(payloadError ?? "Could not load library.");
          return;
        }

        setLibrary(payload);
        setState("ready");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setLibrary(null);
        setState("error");
        setErrorMessage("Network error. Please try again in a moment.");
      }
    }

    void loadLibrary();
    return () => controller.abort();
  }, [token]);

  const groupedReleases = useMemo(() => {
    if (!library) {
      return [];
    }
    return groupDownloadsByRelease(library);
  }, [library]);

  function onTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextToken = normalizeToken(tokenInput);
    writeTokenToHash(nextToken);
    setToken(nextToken);
    if (!nextToken) {
      setState("idle");
      setErrorMessage(null);
      setLibrary(null);
    }
  }

  return (
    <main className={buyerTheme.page}>
      <header className={buyerTheme.header}>
        <div className={buyerTheme.headerInner}>
          <div className="flex items-center gap-3">
            <span className={buyerTheme.brandBadge}>
              {brandGlyph}
            </span>
            <p className="text-lg font-semibold tracking-tight">{brandLabel}</p>
          </div>
          <nav className={buyerTheme.nav}>
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"
              aria-current="page"
              aria-label="Library"
              title="Library"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                library_music
              </span>
              <span className="sr-only">Library</span>
            </span>
            <Link
              href="/find-my-purchases"
              className={`${buyerTheme.navLink} inline-flex h-9 w-9 items-center justify-center rounded-full`}
              aria-label="Find My Purchases"
              title="Find My Purchases"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                receipt
              </span>
              <span className="sr-only">Find My Purchases</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto mb-12 flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className={`${buyerTheme.panel} w-full`}>
          <p className={buyerTheme.eyebrow}>
            Buyer Library
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your Purchases
          </h1>
          <p className={buyerTheme.subtitle}>
            Paste your token from email to unlock downloads.
          </p>

          <form onSubmit={onTokenSubmit} className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input
              id="library-token"
              name="token"
              required
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Paste token from your library email"
              className={buyerTheme.input}
            />
            <button
              type="submit"
              className={`${buyerTheme.buttonPrimary} w-full sm:w-auto`}
            >
              Open Library
            </button>
          </form>
        </div>

        {state === "idle" ? (
          <div className={`${buyerTheme.statusNeutral} w-full`}>
            Enter your token or request a new one from{" "}
            <Link href="/find-my-purchases" className="font-medium text-zinc-900 underline underline-offset-2 hover:text-emerald-700">
              Find My Purchases
            </Link>
            .
          </div>
        ) : null}

        {state === "loading" ? (
          <div className={`${buyerTheme.statusNeutral} w-full`}>
            Loading your library...
          </div>
        ) : null}

        {state === "error" ? (
          <div className={`${buyerTheme.statusError} w-full`}>
            {errorMessage ?? "Could not load library."}
          </div>
        ) : null}

        {state === "ready" && groupedReleases.length === 0 ? (
          <div className={`${buyerTheme.statusNeutral} w-full`}>
            No owned releases were found for this token.
          </div>
        ) : null}

        {state === "ready" && groupedReleases.length > 0 ? (
          <div className="space-y-8">
            {groupedReleases.map((release) => (
              <article
                key={release.id}
                className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)] sm:p-6"
              >
                <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                  <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 md:mx-0 md:max-w-none">
                    {release.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveCoverSrc(release.coverImageUrl) ?? undefined}
                        alt={`${release.title} cover`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="aspect-square w-full bg-[radial-gradient(circle_at_22%_20%,#f43f5e_0%,transparent_35%),radial-gradient(circle_at_78%_75%,#0ea5e9_0%,transparent_40%),linear-gradient(145deg,#121317_0%,#09090a_100%)]" />
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                      Album
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                      {release.title}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600">
                      {release.artistName} • {release.downloads.length} files •{" "}
                      {describeFormats(release.availableFormats)}
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-2.5">
                      {release.zipFormat ? (
                        <a
                          href={`/api/download-release/${encodeURIComponent(token)}/${encodeURIComponent(release.id)}?format=${release.zipFormat}`}
                          className={buyerTheme.buttonPrimary}
                        >
                          Download ZIP ({formatLabel(release.zipFormat)})
                        </a>
                      ) : (
                        <span className={buyerTheme.statusError}>
                          ZIP unavailable
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50">
                  <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5 text-xs uppercase tracking-[0.16em] text-zinc-500">
                    <span>Tracklist</span>
                    <span>{release.downloads.length} files</span>
                  </div>
                  <ul className="divide-y divide-zinc-200/70">
                    {release.downloads.map((download) => {
                      const track = toTrackDisplay(download.fileName);
                      return (
                        <li
                          key={`${download.downloadPath}-${download.fileName}`}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="w-6 text-right text-xs font-medium text-zinc-500">
                              {track.number}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-zinc-900">
                                {track.title}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {download.format
                                  ? formatLabel(download.format)
                                  : "Unknown format"}
                              </p>
                            </div>
                          </div>
                          <a
                            href={download.downloadPath}
                            className="shrink-0 rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
                          >
                            Download file
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
