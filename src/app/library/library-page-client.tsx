"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { buyerTheme } from "@/app/buyer-theme";
import {
  type LibraryState,
  type LibrarySuccessPayload,
  type LibraryTrackDownloadOption,
  type MixedZipPromptState,
  createReleaseZipPath,
  describeFormats,
  extractTokenFromWindow,
  formatLabel,
  groupDownloadsByRelease,
  normalizeToken,
  resolveCoverSrc,
  sortFormats,
  writeTokenToHash,
} from "./library-page-helpers";


function TrackDownloadControl({
  options,
}: {
  options: LibraryTrackDownloadOption[];
}) {
  const [selectedPath, setSelectedPath] = useState(options[0]?.downloadPath ?? "");
  const resolvedSelectedPath =
    options.find((option) => option.downloadPath === selectedPath)?.downloadPath ??
    options[0]?.downloadPath ??
    "";

  const selectedOption =
    options.find((option) => option.downloadPath === resolvedSelectedPath) ??
    options[0] ??
    null;

  const formatCount = new Set(options.map((option) => option.formatLabel)).size;
  const showFormatSelect = formatCount > 1;

  if (!selectedOption) {
    return null;
  }

  return (
    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
      {showFormatSelect ? (
        <label className="sr-only" htmlFor={`track-download-${selectedOption.downloadPath}`}>
          Download format
        </label>
      ) : null}
      {showFormatSelect ? (
        <select
          id={`track-download-${selectedOption.downloadPath}`}
          value={resolvedSelectedPath}
          onChange={(event) => setSelectedPath(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300 sm:flex-none"
        >
          {options.map((option) => (
            <option key={option.downloadPath} value={option.downloadPath}>
              {option.formatLabel}
            </option>
          ))}
        </select>
      ) : null}
      <a
        href={selectedOption.downloadPath}
        className="shrink-0 rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
      >
        Download
      </a>
    </div>
  );
}

export default function LibraryPageClient() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [state, setState] = useState<LibraryState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibrarySuccessPayload | null>(null);
  const [mixedZipPrompt, setMixedZipPrompt] = useState<MixedZipPromptState | null>(null);

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
    <main>
      {mixedZipPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold tracking-tight">Mixed File Types Detected</h2>
            <p className="mt-2 text-sm text-zinc-600">
              &ldquo;{mixedZipPrompt.releaseTitle}&rdquo; has mixed track formats. Do you want one
              best file per track, or every available variant?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={createReleaseZipPath({
                  token,
                  releaseId: mixedZipPrompt.releaseId,
                })}
                className={buyerTheme.buttonPrimary}
                onClick={() => setMixedZipPrompt(null)}
              >
                Best Available (Recommended)
              </a>
              <a
                href={createReleaseZipPath({
                  token,
                  releaseId: mixedZipPrompt.releaseId,
                  mode: "all",
                })}
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-zinc-300 px-5 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
                onClick={() => setMixedZipPrompt(null)}
              >
                All Files
              </a>
              <button
                type="button"
                onClick={() => setMixedZipPrompt(null)}
                className="mt-1 inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-5 py-1.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                        release.canSelectZipFormat ? (
                          <form
                            action={createReleaseZipPath({
                              token,
                              releaseId: release.id,
                            })}
                            method="get"
                            className="flex flex-wrap items-center gap-2.5"
                          >
                            <label htmlFor={`zip-format-${release.id}`} className="sr-only">
                              Select ZIP format for {release.title}
                            </label>
                            <select
                              id={`zip-format-${release.id}`}
                              name="format"
                              defaultValue={release.zipFormat}
                              className="h-8 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300"
                            >
                              {sortFormats(release.availableFormats).map((format) => (
                                <option key={format} value={format}>
                                  {formatLabel(format)}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className={buyerTheme.buttonPrimary}>
                              Download ZIP
                            </button>
                          </form>
                        ) : (
                          release.availableFormats.length > 1 ? (
                            <button
                              type="button"
                              className={buyerTheme.buttonPrimary}
                              onClick={() =>
                                setMixedZipPrompt({
                                  releaseId: release.id,
                                  releaseTitle: release.title,
                                })
                              }
                            >
                              Download ZIP
                            </button>
                          ) : (
                            <a
                              href={createReleaseZipPath({
                                token,
                                releaseId: release.id,
                              })}
                              className={buyerTheme.buttonPrimary}
                            >
                              Download ZIP
                            </a>
                          )
                        )
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
                    <span>{release.tracks.length} tracks</span>
                  </div>
                  <ul className="divide-y divide-zinc-200/70">
                    {release.tracks.map((track) => {
                      return (
                        <li
                          key={track.key}
                          className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                            <span className="w-6 text-right text-xs font-medium text-zinc-500">
                              {track.number}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-zinc-900">
                                {track.title}
                              </p>
                            </div>
                          </div>
                          <TrackDownloadControl options={track.downloadOptions} />
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
