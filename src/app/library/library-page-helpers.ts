export type DownloadFormat = "mp3" | "m4a" | "flac";

export type LibraryDownload = {
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

export type LibrarySuccessPayload = {
  ok: true;
  availableDownloadFormatsByReleaseId: Record<string, DownloadFormat[]>;
  downloads: LibraryDownload[];
};

export type LibraryTrackDownloadOption = {
  downloadPath: string;
  fileName: string;
  format: DownloadFormat | null;
  formatLabel: string;
};

export type LibraryTrackGroup = {
  key: string;
  number: string;
  title: string;
  downloadOptions: LibraryTrackDownloadOption[];
};

export type LibraryReleaseGroup = {
  id: string;
  title: string;
  artistName: string;
  coverImageUrl: string | null;
  downloads: LibraryDownload[];
  tracks: LibraryTrackGroup[];
  availableFormats: DownloadFormat[];
  zipFormat: DownloadFormat | null;
  canSelectZipFormat: boolean;
};

export type LibraryState = "idle" | "loading" | "ready" | "error";

export type MixedZipPromptState = {
  releaseId: string;
  releaseTitle: string;
};

export function normalizeToken(value: string) {
  return value.trim();
}

export function formatLabel(format: DownloadFormat) {
  return format.toUpperCase();
}

export function describeFormats(formats: DownloadFormat[]) {
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

function withoutExtension(fileName: string) {
  const extIndex = fileName.lastIndexOf(".");
  return extIndex > 0 ? fileName.slice(0, extIndex) : fileName;
}

function resolveFormatOptionLabel(download: LibraryDownload) {
  if (download.format) {
    return formatLabel(download.format);
  }

  const ext = download.fileName.split(".").pop()?.trim().toUpperCase();
  return ext && ext.length > 0 ? ext : "Unknown";
}

function buildTrackGroups(downloads: LibraryDownload[]) {
  const groups = new Map<string, LibraryTrackGroup>();

  for (const download of downloads) {
    const fileStem = withoutExtension(download.fileName).trim();
    const key = fileStem.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.downloadOptions.push({
        downloadPath: download.downloadPath,
        fileName: download.fileName,
        format: download.format,
        formatLabel: resolveFormatOptionLabel(download),
      });
      continue;
    }

    const track = toTrackDisplay(download.fileName);
    groups.set(key, {
      key,
      number: track.number,
      title: track.title,
      downloadOptions: [
        {
          downloadPath: download.downloadPath,
          fileName: download.fileName,
          format: download.format,
          formatLabel: resolveFormatOptionLabel(download),
        },
      ],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      downloadOptions: [...group.downloadOptions].sort((a, b) => {
        const rank = (format: DownloadFormat | null) => {
          if (format === "flac") {
            return 0;
          }
          if (format === "m4a") {
            return 1;
          }
          if (format === "mp3") {
            return 2;
          }
          return 3;
        };
        const formatDelta = rank(a.format) - rank(b.format);
        if (formatDelta !== 0) {
          return formatDelta;
        }
        return a.fileName.localeCompare(b.fileName);
      }),
    }))
    .sort((a, b) => {
      if (a.number !== b.number) {
        return a.number.localeCompare(b.number);
      }
      return a.title.localeCompare(b.title);
    });
}

export function extractTokenFromWindow() {
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

export function writeTokenToHash(token: string) {
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

export function sortFormats(formats: DownloadFormat[]) {
  const priority: Record<DownloadFormat, number> = {
    flac: 0,
    m4a: 1,
    mp3: 2,
  };

  return [...formats].sort((a, b) => priority[a] - priority[b]);
}

function getFileStem(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return fileName.trim().toLowerCase();
  }
  return fileName.slice(0, dotIndex).trim().toLowerCase();
}

function canSelectZipFormatForRelease(
  downloads: LibraryDownload[],
  availableFormats: DownloadFormat[],
) {
  if (availableFormats.length < 2) {
    return false;
  }

  const formatSet = new Set(availableFormats);
  const formatsByTrackStem = new Map<string, Set<DownloadFormat>>();

  for (const download of downloads) {
    if (!download.format || !formatSet.has(download.format)) {
      return false;
    }

    const stem = getFileStem(download.fileName);
    const existing = formatsByTrackStem.get(stem) ?? new Set<DownloadFormat>();
    existing.add(download.format);
    formatsByTrackStem.set(stem, existing);
  }

  if (formatsByTrackStem.size === 0) {
    return false;
  }

  for (const trackFormats of formatsByTrackStem.values()) {
    if (trackFormats.size !== availableFormats.length) {
      return false;
    }
    for (const format of availableFormats) {
      if (!trackFormats.has(format)) {
        return false;
      }
    }
  }

  return true;
}

export function resolveCoverSrc(coverImageUrl: string | null) {
  if (!coverImageUrl) {
    return null;
  }
  return `/api/cover?url=${encodeURIComponent(coverImageUrl)}`;
}

export function createReleaseZipPath(input: {
  token: string;
  releaseId: string;
  format?: DownloadFormat;
  mode?: "all";
}) {
  const basePath = `/api/download-release/${encodeURIComponent(input.token)}/${encodeURIComponent(input.releaseId)}`;
  const params = new URLSearchParams();
  if (input.format) {
    params.set("format", input.format);
  }
  if (input.mode === "all") {
    params.set("mode", "all");
  }
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

export function groupDownloadsByRelease(
  payload: LibrarySuccessPayload,
): LibraryReleaseGroup[] {
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
      tracks: [],
      availableFormats,
      zipFormat: chooseZipFormat(availableFormats),
      canSelectZipFormat: false,
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    downloads: [...group.downloads].sort((a, b) => a.fileName.localeCompare(b.fileName)),
    tracks: buildTrackGroups(group.downloads),
    canSelectZipFormat: canSelectZipFormatForRelease(
      group.downloads,
      group.availableFormats,
    ),
  }));
}
