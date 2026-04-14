import type { ChangeEvent, Dispatch, SetStateAction } from "react";

import {
  resolveArtworkPaletteJsonFromCoverFile,
  resolveArtworkPaletteJsonFromImageSource,
  uploadReleaseCoverFile,
} from "./release-cover-upload";
import type { ReleaseDraft } from "./types";

type CoverUploadActionsInput = {
  draftsById: Record<string, ReleaseDraft>;
  trackLocalObjectUrl: (url: string) => void;
  revokeLocalObjectUrl: (url: string) => void;
  setNewCoverPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setCoverUploadTarget: Dispatch<SetStateAction<string | null>>;
  setNewCoverStorageKey: Dispatch<SetStateAction<string | null>>;
  setNewCoverImageUrl: Dispatch<SetStateAction<string>>;
  setNewArtworkPaletteJson: Dispatch<SetStateAction<string | null>>;
  setLocalCoverPreviewForRelease: (releaseId: string, objectUrl: string) => void;
  setDraftsById: Dispatch<SetStateAction<Record<string, ReleaseDraft>>>;
};

export function createReleaseCoverActions(input: CoverUploadActionsInput) {
  const {
    draftsById,
    trackLocalObjectUrl,
    revokeLocalObjectUrl,
    setNewCoverPreviewUrl,
    setError,
    setNotice,
    setCoverUploadTarget,
    setNewCoverStorageKey,
    setNewCoverImageUrl,
    setNewArtworkPaletteJson,
    setLocalCoverPreviewForRelease,
    setDraftsById,
  } = input;

  const onNewCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    trackLocalObjectUrl(objectUrl);
    setNewCoverPreviewUrl((previous) => {
      if (previous && previous !== objectUrl) {
        revokeLocalObjectUrl(previous);
      }
      return objectUrl;
    });

    setError(null);
    setNotice(null);
    setCoverUploadTarget("new");

    try {
      const filePaletteJsonPromise = resolveArtworkPaletteJsonFromCoverFile(file);
      const uploaded = await uploadReleaseCoverFile(file);
      const coverPaletteJson = await resolveArtworkPaletteJsonFromImageSource(
        `/api/cover?url=${encodeURIComponent(uploaded.publicUrl)}`,
      );
      const artworkPaletteJson = coverPaletteJson ?? (await filePaletteJsonPromise);
      setNewCoverStorageKey(uploaded.storageKey);
      setNewCoverImageUrl(uploaded.publicUrl);
      setNewArtworkPaletteJson(artworkPaletteJson);
      setNotice(`Uploaded cover artwork "${file.name}".`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload cover artwork.",
      );
    } finally {
      setCoverUploadTarget(null);
    }
  };

  const onExistingCoverFileChange = async (
    releaseId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const draft = draftsById[releaseId];
    if (!draft) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    trackLocalObjectUrl(objectUrl);
    setLocalCoverPreviewForRelease(releaseId, objectUrl);

    setError(null);
    setNotice(null);
    setCoverUploadTarget(releaseId);

    try {
      const filePaletteJsonPromise = resolveArtworkPaletteJsonFromCoverFile(file);
      const uploaded = await uploadReleaseCoverFile(file);
      const coverPaletteJson = await resolveArtworkPaletteJsonFromImageSource(
        `/api/cover?url=${encodeURIComponent(uploaded.publicUrl)}`,
      );
      const artworkPaletteJson = coverPaletteJson ?? (await filePaletteJsonPromise);
      setDraftsById((previous) => ({
        ...previous,
        [releaseId]: {
          ...(previous[releaseId] ?? draft),
          coverImageUrl: uploaded.publicUrl,
          coverStorageKey: uploaded.storageKey,
          artworkPaletteJson,
          removeCoverImage: false,
        },
      }));
      setNotice(`Uploaded cover artwork "${file.name}".`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload cover artwork.",
      );
    } finally {
      setCoverUploadTarget(null);
    }
  };

  return { onNewCoverFileChange, onExistingCoverFileChange };
}
