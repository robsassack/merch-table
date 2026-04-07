import type { Dispatch, SetStateAction } from "react";

import type { NewTrackDraft, ReleaseDraft, ReleasePreviewDraft, ReleaseRecord, TrackDraft } from "./types";
import {
  areAllMasterAssetsLossless,
  toNewTrackDraft,
  toReleaseDraft,
  toReleasePreviewDraft,
  toTrackDraft,
} from "./utils";

export function syncReleaseDraftState(
  list: ReleaseRecord[],
  setDraftsById: Dispatch<SetStateAction<Record<string, ReleaseDraft>>>,
) {
  setDraftsById((previous) => {
    const next: Record<string, ReleaseDraft> = {};
    for (const release of list) {
      const previousDraft = previous[release.id];
      if (!previousDraft) {
        next[release.id] = toReleaseDraft(release);
        continue;
      }

      if (
        previousDraft.featuredTrackId &&
        !release.tracks.some((track) => track.id === previousDraft.featuredTrackId)
      ) {
        next[release.id] = {
          ...previousDraft,
          featuredTrackId: null,
        };
        continue;
      }

      if (!previousDraft.markLossyOnly && release.isLossyOnly) {
        next[release.id] = {
          ...previousDraft,
          markLossyOnly: true,
          confirmLossyOnly: true,
        };
        continue;
      }

      if (previousDraft.markLossyOnly && areAllMasterAssetsLossless(release)) {
        next[release.id] = {
          ...previousDraft,
          markLossyOnly: false,
          confirmLossyOnly: false,
        };
        continue;
      }

      next[release.id] = previousDraft;
    }
    return next;
  });
}

export function syncReleaseTrackState(
  list: ReleaseRecord[],
  input: {
    setTrackDraftsById: Dispatch<SetStateAction<Record<string, TrackDraft>>>;
    setNewTrackByReleaseId: Dispatch<SetStateAction<Record<string, NewTrackDraft>>>;
    setTrackUploadRoleById: Dispatch<SetStateAction<Record<string, "MASTER" | "DELIVERY">>>;
    setExpandedTrackIdByReleaseId: Dispatch<SetStateAction<Record<string, string | null>>>;
    setDraggingTrackIdByReleaseId: Dispatch<SetStateAction<Record<string, string | null>>>;
    setDragOverTrackIdByReleaseId: Dispatch<SetStateAction<Record<string, string | null>>>;
    setPreviewByReleaseId: Dispatch<SetStateAction<Record<string, ReleasePreviewDraft>>>;
  },
) {
  input.setTrackDraftsById((previous) => {
    const next: Record<string, TrackDraft> = {};
    for (const release of list) {
      for (const track of release.tracks) {
        next[track.id] = previous[track.id] ?? toTrackDraft(track);
      }
    }
    return next;
  });

  input.setNewTrackByReleaseId((previous) => {
    const next: Record<string, NewTrackDraft> = {};
    for (const release of list) {
      next[release.id] = previous[release.id] ?? toNewTrackDraft(release);
    }
    return next;
  });

  input.setTrackUploadRoleById((previous) => {
    const next: Record<string, "MASTER" | "DELIVERY"> = {};
    for (const release of list) {
      for (const track of release.tracks) {
        next[track.id] = previous[track.id] ?? "MASTER";
      }
    }
    return next;
  });

  input.setExpandedTrackIdByReleaseId((previous) => {
    const next: Record<string, string | null> = {};
    for (const release of list) {
      const previousExpanded = previous[release.id] ?? null;
      const stillExists =
        previousExpanded !== null &&
        release.tracks.some((track) => track.id === previousExpanded);
      next[release.id] = stillExists ? previousExpanded : null;
    }
    return next;
  });

  input.setDraggingTrackIdByReleaseId((previous) => {
    const next: Record<string, string | null> = {};
    for (const release of list) {
      next[release.id] = previous[release.id] ?? null;
    }
    return next;
  });

  input.setDragOverTrackIdByReleaseId((previous) => {
    const next: Record<string, string | null> = {};
    for (const release of list) {
      next[release.id] = previous[release.id] ?? null;
    }
    return next;
  });

  input.setPreviewByReleaseId((previous) => {
    const next: Record<string, ReleasePreviewDraft> = {};
    for (const release of list) {
      next[release.id] = previous[release.id] ?? toReleasePreviewDraft(release);
    }
    return next;
  });
}
