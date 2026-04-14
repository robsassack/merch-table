import type { ReleaseAudioTrack } from "@/app/(public)/release/release-audio-player";

const DEFAULT_COVER_SRC = "/default-artwork.png";

function resolveVersionSearchParam(version: string | number | null | undefined) {
  if (version === null || version === undefined) {
    return "";
  }

  const normalized = String(version).trim();
  if (normalized.length === 0) {
    return "";
  }

  return `&v=${encodeURIComponent(normalized)}`;
}

export function resolveCoverSrc(
  coverImageUrl: string | null,
  version?: string | number | null,
) {
  if (!coverImageUrl) {
    return DEFAULT_COVER_SRC;
  }
  return `/api/cover?url=${encodeURIComponent(coverImageUrl)}${resolveVersionSearchParam(version)}`;
}

export function resolveOptionalImageUrl(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveArtistAvatarSrc(input: {
  artistImageUrl: string | null | undefined;
  ownerImageUrl: string | null | undefined;
  version?: string | number | null;
}) {
  const versionSearchParam = resolveVersionSearchParam(input.version);
  const artistImageUrl = resolveOptionalImageUrl(input.artistImageUrl);
  if (artistImageUrl) {
    return `/api/cover?url=${encodeURIComponent(artistImageUrl)}${versionSearchParam}`;
  }

  const ownerImageUrl = resolveOptionalImageUrl(input.ownerImageUrl);
  if (!ownerImageUrl) {
    return null;
  }

  return `/api/cover?url=${encodeURIComponent(ownerImageUrl)}${versionSearchParam}`;
}

export function resolveInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (parts.length === 0) {
    return "A";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function formatReleaseDate(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatReleaseYear(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
  }).format(value);
}

export function formatReleaseType(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return "Album";
  }

  switch (normalized) {
    case "ALBUM":
      return "Album";
    case "EP":
      return "EP";
    case "SINGLE":
      return "Single";
    case "COMPILATION":
      return "Compilation";
    case "MIXTAPE":
      return "Mixtape";
    case "LIVE_ALBUM":
      return "Live Album";
    case "SOUNDTRACK_SCORE":
      return "Soundtrack / Score";
    case "DEMO":
      return "Demo";
    case "BOOTLEG":
      return "Bootleg";
    case "REMIX":
      return "Remix";
    case "OTHER":
      return "Other";
    default:
      return "Album";
  }
}

export function formatTotalDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function resolvePreviewTrackId(
  tracks: ReleaseAudioTrack[],
  featuredTrackId: string | null,
) {
  const playableTracks = tracks.filter((track) => track.isPlayablePreview);
  if (playableTracks.length === 0) {
    return null;
  }

  if (featuredTrackId) {
    const featuredTrack = playableTracks.find((track) => track.id === featuredTrackId);
    if (featuredTrack) {
      return featuredTrack.id;
    }
  }

  return playableTracks[0]?.id ?? null;
}

export function sortDownloadFormats(formats: Array<"mp3" | "m4a" | "flac">) {
  const priority: Record<"mp3" | "m4a" | "flac", number> = {
    flac: 0,
    m4a: 1,
    mp3: 2,
  };

  return [...formats].sort((a, b) => priority[a] - priority[b]);
}
