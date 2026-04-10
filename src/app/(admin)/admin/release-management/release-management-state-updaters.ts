import type { useReleaseManagementState } from "./use-release-management-state";
import type { ReleaseRecord, TrackRecordPatch } from "./types";
import {
  sortTracks,
  toNewTrackDraft,
  toReleaseDraft,
  toReleasePreviewDraft,
  toTrackDraft,
  withReleaseDerivedTrackStats,
} from "./utils";

type ReleaseManagementState = ReturnType<typeof useReleaseManagementState>;

type ReplaceReleaseSetters = Pick<
  ReleaseManagementState,
  | "setReleases"
  | "setDraftsById"
  | "setTrackDraftsById"
  | "setNewTrackByReleaseId"
  | "setPreviewByReleaseId"
>;

export function replaceReleaseState(
  input: ReplaceReleaseSetters & { updated: ReleaseRecord },
) {
  const {
    updated,
    setReleases,
    setDraftsById,
    setTrackDraftsById,
    setNewTrackByReleaseId,
    setPreviewByReleaseId,
  } = input;
  const normalized = withReleaseDerivedTrackStats(updated);

  setReleases((previous) =>
    previous.map((release) => (release.id === normalized.id ? normalized : release)),
  );
  setDraftsById((previous) => ({
    ...previous,
    [normalized.id]: toReleaseDraft(normalized),
  }));
  setTrackDraftsById((previous) => {
    const next = { ...previous };
    for (const track of normalized.tracks) {
      next[track.id] = previous[track.id] ?? toTrackDraft(track);
    }
    return next;
  });
  setNewTrackByReleaseId((previous) => ({
    ...previous,
    [normalized.id]: previous[normalized.id] ?? toNewTrackDraft(normalized),
  }));
  setPreviewByReleaseId((previous) => ({
    ...previous,
    [normalized.id]: previous[normalized.id] ?? toReleasePreviewDraft(normalized),
  }));
}

type ApplyTrackPatchSetters = Pick<
  ReleaseManagementState,
  "setReleases" | "setTrackDraftsById"
>;

export function applyTrackPatchToReleaseState(
  input: ApplyTrackPatchSetters & { releaseId: string; track: TrackRecordPatch },
) {
  const { releaseId, track, setReleases, setTrackDraftsById } = input;
  let nextTracksForDraftSync: TrackRecordPatch[] | null = null;

  setReleases((previous) =>
    previous.map((release) => {
      if (release.id !== releaseId) {
        return release;
      }

      const sorted = sortTracks(release.tracks);
      const existingIndex = sorted.findIndex((entry) => entry.id === track.id);
      const withoutTrack =
        existingIndex >= 0
          ? sorted.filter((entry) => entry.id !== track.id)
          : [...sorted];

      const targetIndex = Math.max(0, Math.min(withoutTrack.length, track.trackNumber - 1));
      const nextTracks = [
        ...withoutTrack.slice(0, targetIndex),
        track,
        ...withoutTrack.slice(targetIndex),
      ].map((entry, index) => ({
        ...entry,
        trackNumber: index + 1,
      }));
      nextTracksForDraftSync = nextTracks;

      return withReleaseDerivedTrackStats({
        ...release,
        tracks: nextTracks,
      });
    }),
  );

  setTrackDraftsById((previous) => {
    if (!nextTracksForDraftSync) {
      return {
        ...previous,
        [track.id]: toTrackDraft(track),
      };
    }

    const next = { ...previous };
    for (const nextTrack of nextTracksForDraftSync) {
      next[nextTrack.id] = toTrackDraft(nextTrack);
    }
    return next;
  });
}
