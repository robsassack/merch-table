import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  ArtistOption,
  DeliveryFormat,
  ImportConflictDialogState,
  NewTrackDraft,
  PricingMode,
  ReleaseDraft,
  TrackDeleteDialogState,
  ReleasePreviewDraft,
  ReleaseRecord,
  ReleaseStatus,
  TrackDraft,
  TrackImportJob,
  TranscodeTasksStatus,
} from "./types";
import { getTodayDateInputValue, isBlobObjectUrl } from "./utils";

export function useReleaseManagementState() {
  const isHydrated = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => true,
    () => false,
  );
  const localObjectUrlsRef = useRef<Set<string>>(new Set());

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, ReleaseDraft>>({});
  const [trackDraftsById, setTrackDraftsById] = useState<Record<string, TrackDraft>>({});
  const [newTrackByReleaseId, setNewTrackByReleaseId] = useState<
    Record<string, NewTrackDraft>
  >({});
  const [previewByReleaseId, setPreviewByReleaseId] = useState<
    Record<string, ReleasePreviewDraft>
  >({});

  const [minimumPriceFloorCents, setMinimumPriceFloorCents] = useState(50);
  const [storeCurrency, setStoreCurrency] = useState("USD");
  const [stripeFeePercentBps, setStripeFeePercentBps] = useState(290);
  const [stripeFeeFixedCents, setStripeFeeFixedCents] = useState(30);

  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksStatus, setTasksStatus] = useState<TranscodeTasksStatus | null>(null);

  const [newArtistId, setNewArtistId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverImageUrl, setNewCoverImageUrl] = useState("");
  const [newCoverPreviewUrl, setNewCoverPreviewUrl] = useState<string | null>(null);
  const [newCoverStorageKey, setNewCoverStorageKey] = useState<string | null>(null);
  const [localCoverPreviewById, setLocalCoverPreviewById] = useState<
    Record<string, string>
  >({});
  const [newPricingMode, setNewPricingMode] = useState<PricingMode>("FREE");
  const [newFixedPrice, setNewFixedPrice] = useState("");
  const [newMinimumPrice, setNewMinimumPrice] = useState("");
  const [newDeliveryFormats, setNewDeliveryFormats] = useState<DeliveryFormat[]>([
    "MP3",
    "M4A",
    "FLAC",
  ]);
  const [newAllowFreeCheckout, setNewAllowFreeCheckout] = useState(false);
  const [newStatus, setNewStatus] = useState<ReleaseStatus>("PUBLISHED");
  const [newReleaseDate, setNewReleaseDate] = useState(getTodayDateInputValue());
  const [newMarkLossyOnly, setNewMarkLossyOnly] = useState(false);
  const [newConfirmLossyOnly, setNewConfirmLossyOnly] = useState(false);
  const [newUrlTouched, setNewUrlTouched] = useState(false);
  const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
  const [createComposerOpen, setCreateComposerOpen] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);

  const [createPending, setCreatePending] = useState(false);
  const [coverUploadTarget, setCoverUploadTarget] = useState<string | "new" | null>(null);
  const [pendingReleaseId, setPendingReleaseId] = useState<string | null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [pendingTrackCreateReleaseId, setPendingTrackCreateReleaseId] = useState<string | null>(
    null,
  );
  const [pendingTrackReorderReleaseId, setPendingTrackReorderReleaseId] = useState<
    string | null
  >(null);
  const [pendingPreviewApplyReleaseId, setPendingPreviewApplyReleaseId] = useState<
    string | null
  >(null);
  const [pendingTrackImportReleaseId, setPendingTrackImportReleaseId] = useState<string | null>(
    null,
  );
  const [pendingTrackUploadId, setPendingTrackUploadId] = useState<string | null>(null);
  const [pendingTrackRequeueId, setPendingTrackRequeueId] = useState<string | null>(null);
  const [trackUploadProgressById, setTrackUploadProgressById] = useState<
    Record<string, number>
  >({});
  const [trackImportJobsByReleaseId, setTrackImportJobsByReleaseId] = useState<
    Record<string, TrackImportJob[]>
  >({});
  const [trackUploadRoleById, setTrackUploadRoleById] = useState<
    Record<string, "MASTER" | "DELIVERY">
  >({});
  const [expandedTrackIdByReleaseId, setExpandedTrackIdByReleaseId] = useState<
    Record<string, string | null>
  >({});
  const [draggingTrackIdByReleaseId, setDraggingTrackIdByReleaseId] = useState<
    Record<string, string | null>
  >({});
  const [dragOverTrackIdByReleaseId, setDragOverTrackIdByReleaseId] = useState<
    Record<string, string | null>
  >({});
  const [advancedById, setAdvancedById] = useState<Record<string, boolean>>({});

  const [purgeDialogRelease, setPurgeDialogRelease] = useState<ReleaseRecord | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState("");
  const [importConflictDialog, setImportConflictDialog] =
    useState<ImportConflictDialogState | null>(null);
  const [trackDeleteDialog, setTrackDeleteDialog] =
    useState<TrackDeleteDialogState | null>(null);

  const activeArtists = useMemo(
    () => artists.filter((artist) => artist.deletedAt === null),
    [artists],
  );

  const deletedCount = useMemo(
    () => releases.filter((release) => release.deletedAt !== null).length,
    [releases],
  );

  const stripeFeeEstimateConfig = useMemo(
    () => ({
      percentBps: stripeFeePercentBps,
      fixedFeeCents: stripeFeeFixedCents,
    }),
    [stripeFeePercentBps, stripeFeeFixedCents],
  );

  const trackLocalObjectUrl = useCallback((objectUrl: string) => {
    if (isBlobObjectUrl(objectUrl)) {
      localObjectUrlsRef.current.add(objectUrl);
    }
  }, []);

  const revokeLocalObjectUrl = useCallback((objectUrl: string | null | undefined) => {
    if (!isBlobObjectUrl(objectUrl)) {
      return;
    }

    if (localObjectUrlsRef.current.has(objectUrl)) {
      URL.revokeObjectURL(objectUrl);
      localObjectUrlsRef.current.delete(objectUrl);
    }
  }, []);

  const setLocalCoverPreviewForRelease = useCallback(
    (releaseId: string, objectUrl: string | null) => {
      setLocalCoverPreviewById((previous) => {
        const previousObjectUrl = previous[releaseId];
        if (previousObjectUrl && previousObjectUrl !== objectUrl) {
          revokeLocalObjectUrl(previousObjectUrl);
        }

        if (!objectUrl) {
          if (!(releaseId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[releaseId];
          return next;
        }

        return {
          ...previous,
          [releaseId]: objectUrl,
        };
      });
    },
    [revokeLocalObjectUrl],
  );

  useEffect(
    () => () => {
      for (const objectUrl of localObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl);
      }
      localObjectUrlsRef.current.clear();
    },
    [],
  );

  return {
    isHydrated,
    artists,
    setArtists,
    releases,
    setReleases,
    draftsById,
    setDraftsById,
    trackDraftsById,
    setTrackDraftsById,
    newTrackByReleaseId,
    setNewTrackByReleaseId,
    previewByReleaseId,
    setPreviewByReleaseId,
    minimumPriceFloorCents,
    setMinimumPriceFloorCents,
    storeCurrency,
    setStoreCurrency,
    stripeFeePercentBps,
    setStripeFeePercentBps,
    stripeFeeFixedCents,
    setStripeFeeFixedCents,
    stripeFeeEstimateConfig,
    loading,
    setLoading,
    tasksLoading,
    setTasksLoading,
    error,
    setError,
    notice,
    setNotice,
    tasksError,
    setTasksError,
    tasksStatus,
    setTasksStatus,
    newArtistId,
    setNewArtistId,
    newTitle,
    setNewTitle,
    newSlug,
    setNewSlug,
    newDescription,
    setNewDescription,
    newCoverImageUrl,
    setNewCoverImageUrl,
    newCoverPreviewUrl,
    setNewCoverPreviewUrl,
    newCoverStorageKey,
    setNewCoverStorageKey,
    localCoverPreviewById,
    newPricingMode,
    setNewPricingMode,
    newFixedPrice,
    setNewFixedPrice,
    newMinimumPrice,
    setNewMinimumPrice,
    newDeliveryFormats,
    setNewDeliveryFormats,
    newAllowFreeCheckout,
    setNewAllowFreeCheckout,
    newStatus,
    setNewStatus,
    newReleaseDate,
    setNewReleaseDate,
    newMarkLossyOnly,
    setNewMarkLossyOnly,
    newConfirmLossyOnly,
    setNewConfirmLossyOnly,
    newUrlTouched,
    setNewUrlTouched,
    createAdvancedOpen,
    setCreateAdvancedOpen,
    createComposerOpen,
    setCreateComposerOpen,
    selectedReleaseId,
    setSelectedReleaseId,
    createPending,
    setCreatePending,
    coverUploadTarget,
    setCoverUploadTarget,
    pendingReleaseId,
    setPendingReleaseId,
    pendingTrackId,
    setPendingTrackId,
    pendingTrackCreateReleaseId,
    setPendingTrackCreateReleaseId,
    pendingTrackReorderReleaseId,
    setPendingTrackReorderReleaseId,
    pendingPreviewApplyReleaseId,
    setPendingPreviewApplyReleaseId,
    pendingTrackImportReleaseId,
    setPendingTrackImportReleaseId,
    pendingTrackUploadId,
    setPendingTrackUploadId,
    pendingTrackRequeueId,
    setPendingTrackRequeueId,
    trackUploadProgressById,
    setTrackUploadProgressById,
    trackImportJobsByReleaseId,
    setTrackImportJobsByReleaseId,
    trackUploadRoleById,
    setTrackUploadRoleById,
    expandedTrackIdByReleaseId,
    setExpandedTrackIdByReleaseId,
    draggingTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    dragOverTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    advancedById,
    setAdvancedById,
    purgeDialogRelease,
    setPurgeDialogRelease,
    purgeConfirmInput,
    setPurgeConfirmInput,
    importConflictDialog,
    setImportConflictDialog,
    trackDeleteDialog,
    setTrackDeleteDialog,
    activeArtists,
    deletedCount,
    trackLocalObjectUrl,
    revokeLocalObjectUrl,
    setLocalCoverPreviewForRelease,
  };
}

export type ReleaseManagementState = ReturnType<typeof useReleaseManagementState>;
