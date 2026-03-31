"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";
import { AdminDialogPortal } from "./dialog-portal";

type ArtistRecord = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  bio: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    releases: number;
  };
};

type ArtistsListResponse = {
  ok?: boolean;
  error?: string;
  artists?: ArtistRecord[];
};

type ArtistMutationResponse = {
  ok?: boolean;
  error?: string;
  artist?: ArtistRecord;
  purgedArtistId?: string;
};

type ArtistDraft = {
  name: string;
  slug: string;
  location: string;
  bio: string;
};

const buttonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

const dangerButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-red-800/80 bg-red-950/70 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/70 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "artist";
}

function sanitizeUrlInput(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getArtistUrlPreview(name: string, slug: string) {
  const custom = sanitizeUrlInput(slug);
  const resolved = custom.length > 0 ? custom : slugify(name);
  return `/artist/${resolved}`;
}

function getMutationError(responseBody: ArtistMutationResponse | null, fallback: string) {
  if (responseBody?.error && responseBody.error.length > 0) {
    return responseBody.error;
  }

  return fallback;
}

export function ArtistManagementPanel() {
  const [artists, setArtists] = useState<ArtistRecord[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, ArtistDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newBio, setNewBio] = useState("");
  const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
  const [newUrlTouched, setNewUrlTouched] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [pendingArtistId, setPendingArtistId] = useState<string | null>(null);
  const [advancedById, setAdvancedById] = useState<Record<string, boolean>>({});
  const [purgeDialogArtist, setPurgeDialogArtist] = useState<ArtistRecord | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState("");

  const deletedCount = useMemo(
    () => artists.filter((artist) => artist.deletedAt !== null).length,
    [artists],
  );

  const syncDrafts = (list: ArtistRecord[]) => {
    setDraftsById((previous) => {
      const next: Record<string, ArtistDraft> = {};
      for (const artist of list) {
        next[artist.id] = previous[artist.id] ?? {
          name: artist.name,
          slug: artist.slug,
          location: artist.location ?? "",
          bio: artist.bio ?? "",
        };
      }
      return next;
    });
  };

  const loadArtists = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/artists", { method: "GET" });
      const body = (await response.json().catch(() => null)) as ArtistsListResponse | null;
      if (!response.ok || !body?.ok || !body.artists) {
        throw new Error(body?.error ?? "Could not load artists.");
      }

      setArtists(body.artists);
      syncDrafts(body.artists);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load artists.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);

  const replaceArtist = (updated: ArtistRecord) => {
    setArtists((previous) =>
      previous.map((artist) => (artist.id === updated.id ? updated : artist)),
    );
    setDraftsById((previous) => ({
      ...previous,
      [updated.id]: {
        name: updated.name,
        slug: updated.slug,
        location: updated.location ?? "",
        bio: updated.bio ?? "",
      },
    }));
  };

  const onCreateArtist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCreatePending(true);

    try {
      const response = await fetch("/api/admin/artists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newName,
          slug: newSlug.length > 0 ? newSlug : undefined,
          location: newLocation.length > 0 ? newLocation : null,
          bio: newBio.length > 0 ? newBio : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as ArtistMutationResponse | null;
      if (!response.ok || !body?.ok || !body.artist) {
        throw new Error(getMutationError(body, "Could not create artist."));
      }

      setArtists((previous) => [body.artist!, ...previous]);
      setDraftsById((previous) => ({
        ...previous,
        [body.artist!.id]: {
          name: body.artist!.name,
          slug: body.artist!.slug,
          location: body.artist!.location ?? "",
          bio: body.artist!.bio ?? "",
        },
      }));
      setNewName("");
      setNewSlug("");
      setNewLocation("");
      setNewBio("");
      setNewUrlTouched(false);
      setCreateAdvancedOpen(false);
      setNotice(`Created artist "${body.artist.name}".`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create artist.");
    } finally {
      setCreatePending(false);
    }
  };

  const onUpdateArtist = async (artistId: string) => {
    const draft = draftsById[artistId];
    if (!draft) {
      return;
    }

    setError(null);
    setNotice(null);
    setPendingArtistId(artistId);

    try {
      const response = await fetch(`/api/admin/artists/${artistId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name: draft.name,
          slug: draft.slug.length > 0 ? draft.slug : undefined,
          location: draft.location.length > 0 ? draft.location : null,
          bio: draft.bio.length > 0 ? draft.bio : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as ArtistMutationResponse | null;
      if (!response.ok || !body?.ok || !body.artist) {
        throw new Error(getMutationError(body, "Could not update artist."));
      }

      replaceArtist(body.artist);
      setNotice(`Saved "${body.artist.name}".`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update artist.");
    } finally {
      setPendingArtistId(null);
    }
  };

  const onSoftDeleteOrRestoreArtist = async (artist: ArtistRecord) => {
    setError(null);
    setNotice(null);
    setPendingArtistId(artist.id);

    try {
      const action = artist.deletedAt ? "restore" : "soft-delete";
      const response = await fetch(`/api/admin/artists/${artist.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as ArtistMutationResponse | null;
      if (!response.ok || !body?.ok || !body.artist) {
        throw new Error(
          getMutationError(
            body,
            action === "restore" ? "Could not restore artist." : "Could not delete artist.",
          ),
        );
      }

      replaceArtist(body.artist);
      setNotice(
        action === "restore"
          ? `Restored "${body.artist.name}".`
          : `Soft-deleted "${body.artist.name}".`,
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not change artist status.",
      );
    } finally {
      setPendingArtistId(null);
    }
  };

  const onPurgeArtist = async (artist: ArtistRecord, confirmName: string) => {
    setError(null);
    setNotice(null);
    setPendingArtistId(artist.id);

    try {
      const response = await fetch(`/api/admin/artists/${artist.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "purge", confirmName }),
      });
      const body = (await response.json().catch(() => null)) as ArtistMutationResponse | null;
      if (!response.ok || !body?.ok) {
        throw new Error(getMutationError(body, "Could not purge artist."));
      }

      setArtists((previous) => previous.filter((candidate) => candidate.id !== artist.id));
      setDraftsById((previous) => {
        const next = { ...previous };
        delete next[artist.id];
        return next;
      });
      setNotice(`Permanently purged "${artist.name}".`);
      setPurgeDialogArtist(null);
      setPurgeConfirmInput("");
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : "Could not purge artist.");
    } finally {
      setPendingArtistId(null);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Artist Management</h2>
        <p className="text-xs text-zinc-500">
          {artists.length} total, {deletedCount} deleted
        </p>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Create artists, update profile fields, soft-delete and restore records, and permanently
        purge deleted artists.
      </p>

      <form onSubmit={onCreateArtist} className="mt-5 rounded-xl border border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-200">Create artist</p>
          <button
            type="button"
            onClick={() => setCreateAdvancedOpen((previous) => !previous)}
            className={buttonClassName}
          >
            {createAdvancedOpen ? "Hide Advanced" : "Advanced"}
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Name (required)
            <input
              required
              maxLength={120}
              value={newName}
              onChange={(event) => {
                const value = event.target.value;
                setNewName(value);
                if (!newUrlTouched) {
                  setNewSlug(slugify(value));
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Artist name"
            />
          </label>

          {createAdvancedOpen ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              URL
              <input
                maxLength={120}
                value={newSlug}
                onChange={(event) => {
                  setNewSlug(sanitizeUrlInput(event.target.value));
                  setNewUrlTouched(true);
                }}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="artist-name"
              />
              <span className="text-[11px] text-zinc-500">
                Preview: {getArtistUrlPreview(newName, newSlug)}
              </span>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Location
            <input
              maxLength={160}
              value={newLocation}
              onChange={(event) => setNewLocation(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Detroit, MI"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Bio
            <textarea
              rows={3}
              maxLength={4_000}
              value={newBio}
              onChange={(event) => setNewBio(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Optional artist bio"
            />
          </label>
        </div>

        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={createPending} className={primaryButtonClassName}>
            {createPending ? "Creating..." : "Create Artist"}
          </button>
        </div>
      </form>

      {notice ? <p className="mt-4 text-sm text-emerald-400">{notice}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500">Loading artists...</p>
      ) : artists.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          No artists yet. Create your first artist above.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {artists.map((artist) => {
            const draft = draftsById[artist.id] ?? {
              name: artist.name,
              slug: artist.slug,
              location: artist.location ?? "",
              bio: artist.bio ?? "",
            };
            const isPending = pendingArtistId === artist.id;

            return (
              <article key={artist.id} className="rounded-xl border border-slate-700 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{artist.name}</h3>
                    {artist.deletedAt ? (
                      <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        deleted
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-500">{artist._count.releases} releases</p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Name (required)
                    <input
                      required
                      maxLength={120}
                      value={draft.name}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [artist.id]: { ...draft, name: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Location
                    <input
                      maxLength={160}
                      value={draft.location}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [artist.id]: { ...draft, location: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Bio
                    <textarea
                      rows={3}
                      maxLength={4_000}
                      value={draft.bio}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [artist.id]: { ...draft, bio: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {advancedById[artist.id] ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                      URL
                      <input
                        maxLength={120}
                        value={draft.slug}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [artist.id]: {
                              ...draft,
                              slug: sanitizeUrlInput(event.target.value),
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                      <span className="text-[11px] text-zinc-500">
                        Preview: {getArtistUrlPreview(draft.name, draft.slug)}
                      </span>
                    </label>
                  ) : null}
                </div>

                <p className="mt-3 text-xs text-zinc-500">
                  Updated {formatIsoTimestampForDisplay(artist.updatedAt)}
                  {artist.deletedAt
                    ? ` • Deleted ${formatIsoTimestampForDisplay(artist.deletedAt)}`
                    : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() =>
                      setAdvancedById((previous) => ({
                        ...previous,
                        [artist.id]: !previous[artist.id],
                      }))
                    }
                    className={buttonClassName}
                  >
                    {advancedById[artist.id] ? "Hide Advanced" : "Advanced"}
                  </button>

                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() => void onUpdateArtist(artist.id)}
                    className={buttonClassName}
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() => void onSoftDeleteOrRestoreArtist(artist)}
                    className={buttonClassName}
                  >
                    {isPending
                      ? artist.deletedAt
                        ? "Restoring..."
                        : "Deleting..."
                      : artist.deletedAt
                        ? "Restore"
                        : "Soft Delete"}
                  </button>

                  {artist.deletedAt ? (
                    <button
                      type="button"
                      disabled={isPending || createPending}
                      onClick={() => {
                        setPurgeDialogArtist(artist);
                        setPurgeConfirmInput("");
                      }}
                      className={dangerButtonClassName}
                    >
                      {isPending ? "Purging..." : "Permanently Purge"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {purgeDialogArtist ? (
        <AdminDialogPortal>
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm permanent artist purge"
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
                <h3 className="text-lg font-semibold text-zinc-100">Confirm permanent purge</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  This will permanently remove <span className="font-semibold">{purgeDialogArtist.name}</span>.
                  Type the artist name to confirm.
                </p>

                <label className="mt-4 flex flex-col gap-1 text-xs text-zinc-500">
                  Artist name confirmation
                  <input
                    value={purgeConfirmInput}
                    onChange={(event) => setPurgeConfirmInput(event.target.value)}
                    className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    placeholder={purgeDialogArtist.name}
                  />
                </label>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className={buttonClassName}
                    onClick={() => {
                      if (pendingArtistId) {
                        return;
                      }
                      setPurgeDialogArtist(null);
                      setPurgeConfirmInput("");
                    }}
                    disabled={Boolean(pendingArtistId)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={dangerButtonClassName}
                    disabled={
                      Boolean(pendingArtistId) ||
                      purgeConfirmInput.trim() !== purgeDialogArtist.name
                    }
                    onClick={() =>
                      void onPurgeArtist(purgeDialogArtist, purgeConfirmInput)
                    }
                  >
                    {pendingArtistId ? "Purging..." : "Confirm Purge"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </AdminDialogPortal>
      ) : null}
    </section>
  );
}
