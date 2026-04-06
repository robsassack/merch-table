"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ArtistManagementArtistCard } from "./artist-management-artist-card";
import { ArtistManagementCreateForm } from "./artist-management-create-form";
import { ArtistManagementPurgeDialog } from "./artist-management-purge-dialog";
import {
  getMutationError,
  type ArtistDraft,
  type ArtistMutationResponse,
  type ArtistRecord,
  type ArtistsListResponse,
} from "./artist-management-panel-shared";

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

      <ArtistManagementCreateForm
        onSubmit={onCreateArtist}
        newName={newName}
        setNewName={setNewName}
        newSlug={newSlug}
        setNewSlug={setNewSlug}
        newLocation={newLocation}
        setNewLocation={setNewLocation}
        newBio={newBio}
        setNewBio={setNewBio}
        createAdvancedOpen={createAdvancedOpen}
        setCreateAdvancedOpen={setCreateAdvancedOpen}
        newUrlTouched={newUrlTouched}
        setNewUrlTouched={setNewUrlTouched}
        createPending={createPending}
      />

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

            return (
              <ArtistManagementArtistCard
                key={artist.id}
                artist={artist}
                draft={draft}
                isPending={pendingArtistId === artist.id}
                createPending={createPending}
                advancedOpen={Boolean(advancedById[artist.id])}
                onDraftChange={(next) =>
                  setDraftsById((previous) => ({
                    ...previous,
                    [artist.id]: next,
                  }))
                }
                onToggleAdvanced={() =>
                  setAdvancedById((previous) => ({
                    ...previous,
                    [artist.id]: !previous[artist.id],
                  }))
                }
                onSave={() => void onUpdateArtist(artist.id)}
                onSoftDeleteOrRestore={() => void onSoftDeleteOrRestoreArtist(artist)}
                onOpenPurgeDialog={() => {
                  setPurgeDialogArtist(artist);
                  setPurgeConfirmInput("");
                }}
              />
            );
          })}
        </div>
      )}

      {purgeDialogArtist ? (
        <ArtistManagementPurgeDialog
          artist={purgeDialogArtist}
          pendingArtistId={pendingArtistId}
          purgeConfirmInput={purgeConfirmInput}
          setPurgeConfirmInput={setPurgeConfirmInput}
          onCancel={() => {
            if (pendingArtistId) {
              return;
            }
            setPurgeDialogArtist(null);
            setPurgeConfirmInput("");
          }}
          onConfirm={() => void onPurgeArtist(purgeDialogArtist, purgeConfirmInput)}
        />
      ) : null}
    </section>
  );
}
