"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  estimateNetPayoutCents,
  estimateStripeFeeCents,
} from "@/lib/pricing/pricing-rules";
import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

type PricingMode = "FREE" | "FIXED" | "PWYW";
type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type ArtistOption = {
  id: string;
  name: string;
  deletedAt: string | null;
};

type ReleaseRecord = {
  id: string;
  artistId: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  pricingMode: PricingMode;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  priceCents: number;
  currency: string;
  status: ReleaseStatus;
  releaseDate: string;
  publishedAt: string | null;
  deletedAt: string | null;
  isLossyOnly: boolean;
  qualityDisclosureRequired: boolean;
  hasLosslessMasters: boolean;
  trackAssetCount: number;
  createdAt: string;
  updatedAt: string;
  artist: {
    id: string;
    name: string;
    deletedAt: string | null;
  };
  _count: {
    tracks: number;
    files: number;
    orderItems: number;
  };
};

type ReleasesListResponse = {
  ok?: boolean;
  error?: string;
  minimumPriceFloorCents?: number;
  storeCurrency?: string;
  stripeFeeEstimate?: {
    percentBps: number;
    fixedFeeCents: number;
  };
  artists?: ArtistOption[];
  releases?: ReleaseRecord[];
};

type ReleaseMutationResponse = {
  ok?: boolean;
  error?: string;
  release?: ReleaseRecord;
  hardDeletedReleaseId?: string;
  purgedAssetCount?: number;
};

type CoverUploadUrlResponse = {
  ok?: boolean;
  error?: string;
  storageKey?: string;
  publicUrl?: string;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
};

type ReleaseDraft = {
  artistId: string;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  coverStorageKey: string | null;
  removeCoverImage: boolean;
  pricingMode: PricingMode;
  fixedPrice: string;
  minimumPrice: string;
  allowFreeCheckout: boolean;
  status: ReleaseStatus;
  releaseDate: string;
  markLossyOnly: boolean;
  confirmLossyOnly: boolean;
};

const buttonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

const dangerButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-red-800/80 bg-red-950/70 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/70 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50";

const pricingModeOptions: Array<{ value: PricingMode; label: string }> = [
  { value: "FREE", label: "Free" },
  { value: "FIXED", label: "Fixed" },
  { value: "PWYW", label: "Pay What You Want" },
];

const statusOptions: Array<{ value: ReleaseStatus; label: string }> = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

function isBlobObjectUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}

function sanitizeUrlInput(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(value: string) {
  const slug = sanitizeUrlInput(value);
  return slug.length > 0 ? slug : "release";
}

function centsToDecimalString(cents: number | null | undefined) {
  if (!Number.isFinite(cents ?? null) || cents === null || cents === undefined) {
    return "";
  }

  return (cents / 100).toFixed(2);
}

function parseCurrencyInputToCents(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

function getTodayDateInputValue() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputValue(isoDateTime: string) {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayDateInputValue();
  }

  const year = String(parsed.getUTCFullYear());
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toCoverDisplaySrc(url: string) {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("/api/admin/releases/cover-proxy?")
  ) {
    return trimmed;
  }

  return `/api/admin/releases/cover-proxy?url=${encodeURIComponent(trimmed)}`;
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function getReleaseUrlPreview(title: string, slug: string) {
  const custom = sanitizeUrlInput(slug);
  const resolved = custom.length > 0 ? custom : slugify(title);
  return `/release/${resolved}`;
}

function toReleaseDraft(release: ReleaseRecord): ReleaseDraft {
  return {
    artistId: release.artistId,
    title: release.title,
    slug: release.slug,
    description: release.description ?? "",
    coverImageUrl: release.coverImageUrl ?? "",
    coverStorageKey: null,
    removeCoverImage: false,
    pricingMode: release.pricingMode,
    fixedPrice: centsToDecimalString(release.fixedPriceCents),
    minimumPrice: centsToDecimalString(release.minimumPriceCents),
    allowFreeCheckout:
      release.pricingMode === "PWYW" && (release.minimumPriceCents ?? null) === 0,
    status: release.status,
    releaseDate: toDateInputValue(release.releaseDate),
    markLossyOnly: release.isLossyOnly,
    confirmLossyOnly: release.isLossyOnly,
  };
}

function getMutationError(responseBody: ReleaseMutationResponse | null, fallback: string) {
  if (responseBody?.error && responseBody.error.length > 0) {
    return responseBody.error;
  }

  return fallback;
}

export function ReleaseManagementPanel() {
  const [isHydrated, setIsHydrated] = useState(false);
  const localObjectUrlsRef = useRef<Set<string>>(new Set());

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, ReleaseDraft>>({});

  const [minimumPriceFloorCents, setMinimumPriceFloorCents] = useState(50);
  const [storeCurrency, setStoreCurrency] = useState("USD");
  const [stripeFeePercentBps, setStripeFeePercentBps] = useState(290);
  const [stripeFeeFixedCents, setStripeFeeFixedCents] = useState(30);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  const [advancedById, setAdvancedById] = useState<Record<string, boolean>>({});

  const [purgeDialogRelease, setPurgeDialogRelease] = useState<ReleaseRecord | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState("");

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

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const syncDrafts = (list: ReleaseRecord[]) => {
    setDraftsById((previous) => {
      const next: Record<string, ReleaseDraft> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? toReleaseDraft(release);
      }
      return next;
    });
  };

  const loadReleases = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/releases", { method: "GET" });
      const body = (await response.json().catch(() => null)) as ReleasesListResponse | null;
      if (!response.ok || !body?.ok || !body.releases || !body.artists) {
        throw new Error(body?.error ?? "Could not load releases.");
      }

      setReleases(body.releases);
      setArtists(body.artists);
      syncDrafts(body.releases);
      setMinimumPriceFloorCents(body.minimumPriceFloorCents ?? 50);
      setStoreCurrency(body.storeCurrency ?? "USD");
      setStripeFeePercentBps(body.stripeFeeEstimate?.percentBps ?? 290);
      setStripeFeeFixedCents(body.stripeFeeEstimate?.fixedFeeCents ?? 30);
      const artistList = body.artists;

      setNewArtistId((current) => {
        if (current.length > 0) {
          return current;
        }

        const firstArtist = artistList.find((artist) => artist.deletedAt === null);
        return firstArtist?.id ?? current;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load releases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  useEffect(() => {
    setSelectedReleaseId((current) => {
      if (releases.length === 0) {
        return null;
      }

      if (current && releases.some((release) => release.id === current)) {
        return current;
      }

      return releases[0].id;
    });
  }, [releases]);

  useEffect(() => {
    if (!loading && releases.length === 0) {
      setCreateComposerOpen(true);
    }
  }, [loading, releases.length]);

  const replaceRelease = (updated: ReleaseRecord) => {
    setReleases((previous) =>
      previous.map((release) => (release.id === updated.id ? updated : release)),
    );
    setDraftsById((previous) => ({
      ...previous,
      [updated.id]: toReleaseDraft(updated),
    }));
  };

  const uploadCoverFile = useCallback(async (file: File) => {
    const contentType = file.type.trim().toLowerCase();
    if (!ALLOWED_COVER_MIME_TYPES.has(contentType)) {
      throw new Error(
        "Unsupported cover image format. Use JPEG, PNG, WEBP, AVIF, or GIF.",
      );
    }

    const response = await fetch("/api/admin/releases/cover-upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      }),
    });
    const body = (await response.json().catch(() => null)) as CoverUploadUrlResponse | null;

    if (
      !response.ok ||
      !body?.ok ||
      !body.uploadUrl ||
      !body.publicUrl ||
      !body.storageKey
    ) {
      throw new Error(body?.error ?? "Could not prepare cover upload.");
    }

    const putResponse = await fetch(body.uploadUrl, {
      method: "PUT",
      headers: {
        ...(body.requiredHeaders ?? {}),
        "content-type": body.requiredHeaders?.["content-type"] ?? contentType,
      },
      body: file,
    });

    if (!putResponse.ok) {
      throw new Error(`Cover upload failed with status ${putResponse.status}.`);
    }

    return {
      storageKey: body.storageKey,
      publicUrl: body.publicUrl,
    };
  }, []);

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
      const uploaded = await uploadCoverFile(file);
      setNewCoverStorageKey(uploaded.storageKey);
      setNewCoverImageUrl(uploaded.publicUrl);
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
      const uploaded = await uploadCoverFile(file);
      setDraftsById((previous) => ({
        ...previous,
        [releaseId]: {
          ...draft,
          coverImageUrl: uploaded.publicUrl,
          coverStorageKey: uploaded.storageKey,
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

  const getPricingEstimate = (draft: ReleaseDraft, currency: string) => {
    const source = draft.pricingMode === "FIXED" ? draft.fixedPrice : draft.minimumPrice;
    const grossCents = parseCurrencyInputToCents(source);

    if (draft.pricingMode === "FREE" || grossCents === null || grossCents <= 0) {
      return null;
    }

    const feeCents = estimateStripeFeeCents(grossCents, stripeFeeEstimateConfig);
    const netCents = estimateNetPayoutCents(grossCents, stripeFeeEstimateConfig);

    return {
      grossCents,
      feeCents,
      netCents,
      grossLabel: formatCurrency(grossCents, currency),
      feeLabel: formatCurrency(feeCents, currency),
      netLabel: formatCurrency(netCents, currency),
      belowFloor:
        grossCents < minimumPriceFloorCents &&
        !(draft.pricingMode === "PWYW" && draft.allowFreeCheckout && grossCents === 0),
    };
  };

  const onCreateRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCreatePending(true);

    try {
      const response = await fetch("/api/admin/releases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistId: newArtistId,
          title: newTitle,
          slug: newSlug.length > 0 ? newSlug : undefined,
          description: newDescription.length > 0 ? newDescription : null,
          coverStorageKey: newCoverStorageKey,
          pricingMode: newPricingMode,
          fixedPriceCents:
            newPricingMode === "FIXED" ? parseCurrencyInputToCents(newFixedPrice) : null,
          minimumPriceCents:
            newPricingMode === "PWYW"
              ? (parseCurrencyInputToCents(newMinimumPrice) ??
                (newAllowFreeCheckout ? 0 : null))
              : null,
          allowFreeCheckout: newPricingMode === "PWYW" ? newAllowFreeCheckout : false,
          status: newStatus,
          releaseDate: newReleaseDate,
          markLossyOnly: newMarkLossyOnly,
          confirmLossyOnly: newConfirmLossyOnly,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not create release."));
      }

      setReleases((previous) => [body.release!, ...previous]);
      setDraftsById((previous) => ({
        ...previous,
        [body.release!.id]: toReleaseDraft(body.release!),
      }));

      setNewTitle("");
      setNewSlug("");
      setNewDescription("");
      setNewCoverImageUrl("");
      setNewCoverPreviewUrl((previous) => {
        revokeLocalObjectUrl(previous);
        return null;
      });
      setNewCoverStorageKey(null);
      setNewPricingMode("FREE");
      setNewFixedPrice("");
      setNewMinimumPrice("");
      setNewAllowFreeCheckout(false);
      setNewStatus("PUBLISHED");
      setNewReleaseDate(getTodayDateInputValue());
      setNewMarkLossyOnly(false);
      setNewConfirmLossyOnly(false);
      setNewUrlTouched(false);
      setCreateAdvancedOpen(false);
      setCreateComposerOpen(false);
      setSelectedReleaseId(body.release.id);
      setNotice(`Created release "${body.release.title}".`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create release.");
    } finally {
      setCreatePending(false);
    }
  };

  const onUpdateRelease = async (releaseId: string) => {
    const draft = draftsById[releaseId];
    if (!draft) {
      return;
    }

    setError(null);
    setNotice(null);
    setPendingReleaseId(releaseId);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          artistId: draft.artistId,
          title: draft.title,
          slug: draft.slug.length > 0 ? draft.slug : undefined,
          description: draft.description.length > 0 ? draft.description : null,
          coverStorageKey: draft.coverStorageKey,
          removeCoverImage: draft.removeCoverImage,
          pricingMode: draft.pricingMode,
          fixedPriceCents:
            draft.pricingMode === "FIXED"
              ? parseCurrencyInputToCents(draft.fixedPrice)
              : null,
          minimumPriceCents:
            draft.pricingMode === "PWYW"
              ? (parseCurrencyInputToCents(draft.minimumPrice) ??
                (draft.allowFreeCheckout ? 0 : null))
              : null,
          allowFreeCheckout: draft.pricingMode === "PWYW" ? draft.allowFreeCheckout : false,
          status: draft.status,
          releaseDate: draft.releaseDate,
          markLossyOnly: draft.markLossyOnly,
          confirmLossyOnly: draft.confirmLossyOnly,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not update release."));
      }

      replaceRelease(body.release);
      setNotice(`Saved "${body.release.title}".`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update release.");
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onSoftDeleteOrRestoreRelease = async (release: ReleaseRecord) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const action = release.deletedAt ? "restore" : "soft-delete";
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(
          getMutationError(
            body,
            action === "restore" ? "Could not restore release." : "Could not delete release.",
          ),
        );
      }

      replaceRelease(body.release);
      setNotice(
        action === "restore"
          ? `Restored "${body.release.title}".`
          : `Soft-deleted "${body.release.title}".`,
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not change release status.");
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onPurgeRelease = async (release: ReleaseRecord, confirmTitle: string) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "purge",
          confirmTitle,
        }),
      });

      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not purge release assets."));
      }

      replaceRelease(body.release);
      setNotice(
        `Purged ${body.purgedAssetCount ?? 0} storage asset${body.purgedAssetCount === 1 ? "" : "s"} for "${release.title}".`,
      );
      setPurgeDialogRelease(null);
      setPurgeConfirmInput("");
    } catch (purgeError) {
      setError(
        purgeError instanceof Error ? purgeError.message : "Could not purge release assets.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onHardDeleteRelease = async (release: ReleaseRecord, confirmTitle: string) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "hard-delete",
          confirmTitle,
        }),
      });

      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.hardDeletedReleaseId) {
        throw new Error(getMutationError(body, "Could not fully delete release."));
      }
      const hardDeletedReleaseId = body.hardDeletedReleaseId;

      setReleases((previous) =>
        previous.filter((entry) => entry.id !== hardDeletedReleaseId),
      );
      setDraftsById((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setNotice(
        `Fully deleted "${release.title}" and removed ${body.purgedAssetCount ?? 0} storage asset${body.purgedAssetCount === 1 ? "" : "s"}.`,
      );
      setPurgeDialogRelease(null);
      setPurgeConfirmInput("");
    } catch (hardDeleteError) {
      setError(
        hardDeleteError instanceof Error
          ? hardDeleteError.message
          : "Could not fully delete release.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const renderPricingDetails = (draft: ReleaseDraft, currency: string) => {
    if (draft.pricingMode === "FREE") {
      return (
        <p className="mt-2 text-xs text-zinc-500">
          Free release. Stripe is bypassed and no minimum floor applies.
        </p>
      );
    }

    const estimate = getPricingEstimate(draft, currency);

    return (
      <>
        <p className="mt-2 text-xs text-zinc-500">
          Minimum system floor:{" "}
          {draft.pricingMode === "PWYW" && draft.allowFreeCheckout
            ? `${formatCurrency(0, currency)} (free checkout enabled) or ${formatCurrency(minimumPriceFloorCents, currency)}+`
            : formatCurrency(minimumPriceFloorCents, currency)}
          .
        </p>
        {estimate ? (
          <p className="mt-1 text-xs text-zinc-400">
            At {estimate.grossLabel}, Stripe fees are ~{estimate.feeLabel} and payout is ~
            {estimate.netLabel}.
          </p>
        ) : draft.pricingMode === "PWYW" && draft.allowFreeCheckout ? (
          <p className="mt-1 text-xs text-zinc-400">
            Free checkout is enabled. Buyers can check out at{" "}
            {formatCurrency(0, currency)}.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Enter a price to preview Stripe fee and net payout.
          </p>
        )}
        {estimate?.belowFloor ? (
          <p className="mt-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            Price is below the minimum floor of {formatCurrency(minimumPriceFloorCents, currency)}.
          </p>
        ) : null}
      </>
    );
  };

  const newCoverPreviewSrc = newCoverPreviewUrl ?? newCoverImageUrl;

  if (!isHydrated) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
        <p className="text-sm text-zinc-500">Loading release management…</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Release Management</h2>
        <p className="text-xs text-zinc-500">
          {releases.length} total, {deletedCount} deleted
        </p>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Create releases, configure pricing, disclose lossy-only quality, and manage soft delete,
        restore, and permanent asset purge.
      </p>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Releases</p>
        <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setCreateComposerOpen(true)}
            className="flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/60 text-zinc-300 transition hover:border-slate-400 hover:text-zinc-100"
            aria-label="Create new release"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="mt-2 text-xs font-medium">Create</span>
          </button>

          {releases.map((release) => {
            const isSelected = selectedReleaseId === release.id;
            const cardCoverPreviewSrc =
              localCoverPreviewById[release.id] ??
              draftsById[release.id]?.coverImageUrl ??
              release.coverImageUrl;
            const cardDisplaySrc = cardCoverPreviewSrc
              ? toCoverDisplaySrc(cardCoverPreviewSrc)
              : "";

            return (
              <button
                key={release.id}
                type="button"
                onClick={() => {
                  setSelectedReleaseId(release.id);
                  setCreateComposerOpen(false);
                }}
                className={`group flex h-32 w-32 shrink-0 flex-col overflow-hidden rounded-xl border text-left transition ${
                  isSelected
                    ? "border-emerald-500/70 bg-emerald-950/30"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-500"
                }`}
                aria-pressed={isSelected}
                aria-label={`Select release ${release.title}`}
              >
                {cardDisplaySrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardDisplaySrc}
                    alt={`${release.title} cover`}
                    className="h-20 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-full items-center justify-center bg-slate-800 text-[11px] text-zinc-500">
                    no artwork
                  </div>
                )}

                <div className="flex min-h-0 flex-1 items-center justify-between gap-2 px-2 py-1.5">
                  <p className="line-clamp-2 text-xs font-medium text-zinc-200">{release.title}</p>
                  {release.deletedAt ? (
                    <span className="shrink-0 rounded-full border border-amber-700/70 bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      del
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {createComposerOpen ? (
      <form onSubmit={onCreateRelease} className="mt-5 rounded-xl border border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-200">Create release</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateAdvancedOpen((previous) => !previous)}
              className={buttonClassName}
            >
              {createAdvancedOpen ? "Hide Advanced" : "Advanced"}
            </button>
            <button
              type="button"
              onClick={() => setCreateComposerOpen(false)}
              className={buttonClassName}
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Artist (required)
            <select
              required
              value={newArtistId}
              onChange={(event) => setNewArtistId(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              <option value="" disabled>
                Select artist
              </option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id} disabled={artist.deletedAt !== null}>
                  {artist.name}
                  {artist.deletedAt ? " (deleted)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Title (required)
            <input
              required
              maxLength={160}
              value={newTitle}
              onChange={(event) => {
                const value = event.target.value;
                setNewTitle(value);
                if (!newUrlTouched) {
                  setNewSlug(slugify(value));
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Release title"
            />
          </label>

          {createAdvancedOpen ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              URL
              <input
                maxLength={160}
                value={newSlug}
                onChange={(event) => {
                  setNewSlug(sanitizeUrlInput(event.target.value));
                  setNewUrlTouched(true);
                }}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="release-title"
              />
              <span className="text-[11px] text-zinc-500">
                Preview: {getReleaseUrlPreview(newTitle, newSlug)}
              </span>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Description
            <textarea
              rows={3}
              maxLength={4_000}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Optional release description"
            />
          </label>

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Cover artwork</p>
            <p className="mt-1">
              Upload square artwork for this release. JPEG, PNG, WEBP, AVIF, and GIF are supported.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className={buttonClassName}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  className="hidden"
                  onChange={(event) => void onNewCoverFileChange(event)}
                  disabled={createPending || coverUploadTarget === "new"}
                />
                {coverUploadTarget === "new" ? "Uploading..." : "Upload Cover"}
              </label>

              <button
                type="button"
                className={buttonClassName}
                disabled={
                  createPending ||
                  coverUploadTarget === "new" ||
                  (newCoverImageUrl.length === 0 && newCoverStorageKey === null)
                }
                onClick={() => {
                  setNewCoverImageUrl("");
                  setNewCoverPreviewUrl((previous) => {
                    revokeLocalObjectUrl(previous);
                    return null;
                  });
                  setNewCoverStorageKey(null);
                }}
              >
                Remove Cover
              </button>
            </div>

            {newCoverPreviewSrc ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toCoverDisplaySrc(newCoverPreviewSrc)}
                  alt="New release cover preview"
                  className="h-28 w-28 rounded-lg border border-slate-700 object-cover"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">No cover uploaded yet.</p>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Pricing mode
            <select
              value={newPricingMode}
              onChange={(event) => {
                const mode = event.target.value as PricingMode;
                setNewPricingMode(mode);
                if (mode !== "PWYW") {
                  setNewAllowFreeCheckout(false);
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              {pricingModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Status
            <select
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value as ReleaseStatus)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Release date
            <input
              type="date"
              required
              value={newReleaseDate}
              onChange={(event) => setNewReleaseDate(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            />
          </label>

          {newPricingMode === "FIXED" ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              Fixed price ({storeCurrency})
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={newFixedPrice}
                onChange={(event) => setNewFixedPrice(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="5.00"
              />
            </label>
          ) : null}

          {newPricingMode === "PWYW" ? (
            <div className="flex flex-col gap-2 text-xs text-zinc-500 sm:col-span-2">
              <label className="flex flex-col gap-1">
                PWYW minimum ({storeCurrency})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={newMinimumPrice}
                  onChange={(event) => setNewMinimumPrice(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                  placeholder={newAllowFreeCheckout ? "0.00" : "2.00"}
                />
              </label>
              <label className="inline-flex items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={newAllowFreeCheckout}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setNewAllowFreeCheckout(checked);
                    if (checked && newMinimumPrice.trim().length === 0) {
                      setNewMinimumPrice("0.00");
                    }
                  }}
                />
                Allow free checkout ($0)
              </label>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Pricing estimate</p>
            {renderPricingDetails(
              {
                artistId: newArtistId,
                title: newTitle,
                slug: newSlug,
                description: newDescription,
                coverImageUrl: newCoverImageUrl,
                coverStorageKey: newCoverStorageKey,
                removeCoverImage: false,
                pricingMode: newPricingMode,
                fixedPrice: newFixedPrice,
                minimumPrice: newMinimumPrice,
                allowFreeCheckout: newAllowFreeCheckout,
                status: newStatus,
                releaseDate: newReleaseDate,
                markLossyOnly: newMarkLossyOnly,
                confirmLossyOnly: newConfirmLossyOnly,
              },
              storeCurrency,
            )}
          </div>

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Master quality workflow</p>
            <p className="mt-1">
              Upload lossless masters first when possible. If you only have lossy files, mark this
              release as lossy-only and confirm disclosure.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="new-lossless"
                  checked={!newMarkLossyOnly}
                  onChange={() => {
                    setNewMarkLossyOnly(false);
                    setNewConfirmLossyOnly(false);
                  }}
                  className="mt-0.5"
                />
                <span className="text-zinc-300">Lossless masters available</span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="new-lossless"
                  checked={newMarkLossyOnly}
                  onChange={() => {
                    setNewMarkLossyOnly(true);
                    setNewConfirmLossyOnly(false);
                  }}
                  className="mt-0.5"
                />
                <span className="text-zinc-300">Lossy-only for now</span>
              </label>
            </div>

            {newMarkLossyOnly ? (
              <label className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                <input
                  type="checkbox"
                  checked={newConfirmLossyOnly}
                  onChange={(event) => setNewConfirmLossyOnly(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm this release currently has no lossless masters and should show a quality
                  disclosure.
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={
              createPending ||
              coverUploadTarget === "new" ||
              activeArtists.length === 0 ||
              (newMarkLossyOnly && !newConfirmLossyOnly)
            }
            className={primaryButtonClassName}
          >
            {createPending ? "Creating..." : "Create Release"}
          </button>
        </div>

        {activeArtists.length === 0 ? (
          <p className="mt-3 text-xs text-amber-300">
            Create at least one active artist before creating releases.
          </p>
        ) : null}
      </form>
      ) : null}

      {notice ? <p className="mt-4 text-sm text-emerald-400">{notice}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500">Loading releases...</p>
      ) : releases.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          No releases yet. Use the + card above to create your first release.
        </p>
      ) : createComposerOpen ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          Creating a new release. Close the composer to return to release editing.
        </p>
      ) : selectedReleaseId === null ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          Select a release from the top strip.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {releases.filter((release) => release.id === selectedReleaseId).map((release) => {
            const draft = draftsById[release.id] ?? toReleaseDraft(release);
            const isPending = pendingReleaseId === release.id;
            const estimate = getPricingEstimate(draft, release.currency || "USD");
            const existingCoverPreviewSrc =
              localCoverPreviewById[release.id] ?? draft.coverImageUrl;

            return (
              <article key={release.id} className="rounded-xl border border-slate-700 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{release.title}</h3>
                    {release.deletedAt ? (
                      <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        deleted
                      </span>
                    ) : null}
                    {release.qualityDisclosureRequired ? (
                      <span className="rounded-full border border-rose-700/70 bg-rose-950/40 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        quality disclosure
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-zinc-500">
                    {release._count.tracks} tracks • {release._count.files} files • {release._count.orderItems} orders
                  </p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Artist
                    <select
                      value={draft.artistId}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, artistId: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {artists.map((artist) => (
                        <option
                          key={artist.id}
                          value={artist.id}
                          disabled={artist.deletedAt !== null && artist.id !== release.artistId}
                        >
                          {artist.name}
                          {artist.deletedAt ? " (deleted)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Title
                    <input
                      required
                      maxLength={160}
                      value={draft.title}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, title: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {advancedById[release.id] ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                      URL
                      <input
                        maxLength={160}
                        value={draft.slug}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              slug: sanitizeUrlInput(event.target.value),
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                      <span className="text-[11px] text-zinc-500">
                        Preview: {getReleaseUrlPreview(draft.title, draft.slug)}
                      </span>
                    </label>
                  ) : null}

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Description
                    <textarea
                      rows={3}
                      maxLength={4_000}
                      value={draft.description}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, description: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <p className="font-medium text-zinc-300">Cover artwork</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className={buttonClassName}>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                          className="hidden"
                          onChange={(event) => void onExistingCoverFileChange(release.id, event)}
                          disabled={isPending || createPending || coverUploadTarget === release.id}
                        />
                        {coverUploadTarget === release.id ? "Uploading..." : "Upload Cover"}
                      </label>
                      <button
                        type="button"
                        className={buttonClassName}
                        disabled={
                          isPending ||
                          createPending ||
                          coverUploadTarget === release.id ||
                          existingCoverPreviewSrc.length === 0
                        }
                        onClick={() => {
                          setLocalCoverPreviewForRelease(release.id, null);
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              coverImageUrl: "",
                              coverStorageKey: null,
                              removeCoverImage: true,
                            },
                          }));
                        }}
                      >
                        Remove Cover
                      </button>
                    </div>

                    {existingCoverPreviewSrc ? (
                      <div className="mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={toCoverDisplaySrc(existingCoverPreviewSrc)}
                          alt={`${draft.title} cover preview`}
                          className="h-24 w-24 rounded-lg border border-slate-700 object-cover"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500">No cover artwork.</p>
                    )}
                  </div>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Pricing mode
                    <select
                      value={draft.pricingMode}
                      onChange={(event) => {
                        const value = event.target.value as PricingMode;
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            pricingMode: value,
                            allowFreeCheckout:
                              value === "PWYW" ? draft.allowFreeCheckout : false,
                          },
                        }));
                      }}
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {pricingModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Status
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            status: event.target.value as ReleaseStatus,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Release date
                    <input
                      type="date"
                      required
                      value={draft.releaseDate}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            releaseDate: event.target.value,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {draft.pricingMode === "FIXED" ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                      Fixed price ({release.currency})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.fixedPrice}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              fixedPrice: event.target.value,
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                    </label>
                  ) : null}

                  {draft.pricingMode === "PWYW" ? (
                    <div className="flex flex-col gap-2 text-xs text-zinc-500 sm:col-span-2">
                      <label className="flex flex-col gap-1">
                        PWYW minimum ({release.currency})
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draft.minimumPrice}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                minimumPrice: event.target.value,
                              },
                            }))
                          }
                          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                          placeholder={draft.allowFreeCheckout ? "0.00" : "2.00"}
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-zinc-300">
                        <input
                          type="checkbox"
                          checked={draft.allowFreeCheckout}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                allowFreeCheckout: event.target.checked,
                                minimumPrice:
                                  event.target.checked && draft.minimumPrice.trim().length === 0
                                    ? "0.00"
                                    : draft.minimumPrice,
                              },
                            }))
                          }
                        />
                        Allow free checkout ($0)
                      </label>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <p className="font-medium text-zinc-300">Pricing estimate</p>
                    {renderPricingDetails(draft, release.currency || "USD")}
                  </div>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <p className="font-medium text-zinc-300">Master quality workflow</p>
                    <p className="mt-1">
                      Release assets tracked: {release.trackAssetCount}. Lossless masters detected: {release.hasLosslessMasters ? "yes" : "no"}.
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lossless-${release.id}`}
                          checked={!draft.markLossyOnly}
                          onChange={() =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                markLossyOnly: false,
                                confirmLossyOnly: false,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-zinc-300">Lossless masters available</span>
                      </label>
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lossless-${release.id}`}
                          checked={draft.markLossyOnly}
                          onChange={() =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                markLossyOnly: true,
                                confirmLossyOnly: release.isLossyOnly
                                  ? draft.confirmLossyOnly
                                  : false,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-zinc-300">Lossy-only for now</span>
                      </label>
                    </div>

                    {draft.markLossyOnly ? (
                      <label className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                        <input
                          type="checkbox"
                          checked={draft.confirmLossyOnly}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                confirmLossyOnly: event.target.checked,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          I confirm this release should be marked lossy-only and show quality
                          disclosure.
                        </span>
                      </label>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-500">
                  Updated {formatIsoTimestampForDisplay(release.updatedAt)}
                  {release.releaseDate
                    ? ` • Release date ${formatIsoTimestampForDisplay(release.releaseDate)}`
                    : ""}
                  {release.deletedAt
                    ? ` • Deleted ${formatIsoTimestampForDisplay(release.deletedAt)}`
                    : ""}
                  {release.publishedAt
                    ? ` • Published ${formatIsoTimestampForDisplay(release.publishedAt)}`
                    : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() =>
                      setAdvancedById((previous) => ({
                        ...previous,
                        [release.id]: !previous[release.id],
                      }))
                    }
                    className={buttonClassName}
                  >
                    {advancedById[release.id] ? "Hide Advanced" : "Advanced"}
                  </button>

                  <button
                    type="button"
                    disabled={
                      isPending ||
                      createPending ||
                      coverUploadTarget === release.id ||
                      (draft.markLossyOnly && !draft.confirmLossyOnly)
                    }
                    onClick={() => void onUpdateRelease(release.id)}
                    className={buttonClassName}
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() => void onSoftDeleteOrRestoreRelease(release)}
                    className={buttonClassName}
                  >
                    {isPending
                      ? release.deletedAt
                        ? "Restoring..."
                        : "Deleting..."
                      : release.deletedAt
                        ? "Restore"
                        : "Soft Delete"}
                  </button>

                  {release.deletedAt ? (
                    <button
                      type="button"
                      disabled={isPending || createPending}
                      onClick={() => {
                        setPurgeDialogRelease(release);
                        setPurgeConfirmInput("");
                      }}
                      className={dangerButtonClassName}
                    >
                      {isPending ? "Purging..." : "Permanent Purge"}
                    </button>
                  ) : null}
                </div>

                {estimate && draft.pricingMode !== "FREE" ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Preview: {estimate.grossLabel} gross • ~{estimate.feeLabel} fee • ~
                    {estimate.netLabel} payout
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {purgeDialogRelease ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm release asset purge"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Confirm destructive action</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This permanently removes stored assets for <span className="font-semibold">{purgeDialogRelease.title}</span>. The release record remains for history and can no longer serve those files.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Fully delete permanently removes both stored assets and the release record. Releases
              with existing orders cannot be fully deleted.
            </p>

            <label className="mt-4 flex flex-col gap-1 text-xs text-zinc-500">
              Release title confirmation
              <input
                value={purgeConfirmInput}
                onChange={(event) => setPurgeConfirmInput(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder={purgeDialogRelease.title}
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={buttonClassName}
                onClick={() => {
                  if (pendingReleaseId) {
                    return;
                  }
                  setPurgeDialogRelease(null);
                  setPurgeConfirmInput("");
                }}
                disabled={Boolean(pendingReleaseId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={
                  Boolean(pendingReleaseId) ||
                  purgeConfirmInput.trim() !== purgeDialogRelease.title
                }
                onClick={() => void onPurgeRelease(purgeDialogRelease, purgeConfirmInput)}
              >
                {pendingReleaseId ? "Purging..." : "Confirm Purge"}
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={
                  Boolean(pendingReleaseId) ||
                  purgeConfirmInput.trim() !== purgeDialogRelease.title
                }
                onClick={() => void onHardDeleteRelease(purgeDialogRelease, purgeConfirmInput)}
              >
                {pendingReleaseId ? "Deleting..." : "Fully Delete Record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
