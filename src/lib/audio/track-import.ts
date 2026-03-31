export type TrackImportOrderCandidate<T = string> = {
  id: T;
  fileName: string;
  metadataTrackNumber: number | null | undefined;
};

const naturalNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function trimToNull(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function basename(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  const pieces = normalized.split("/");
  return pieces[pieces.length - 1] ?? fileName;
}

function stripExtension(fileName: string) {
  const base = basename(fileName);
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) {
    return base;
  }

  return base.slice(0, dotIndex);
}

export function normalizeMetadataTrackNumber(value: number | null | undefined) {
  if (!Number.isFinite(value) || value === null || value === undefined || value <= 0) {
    return null;
  }

  return Math.round(value);
}

export function normalizeDetectedDurationMs(value: number | null | undefined) {
  if (!Number.isFinite(value) || value === null || value === undefined || value <= 0) {
    return null;
  }

  return Math.round(value);
}

export function deriveTrackTitleFromFileName(fileName: string) {
  const withoutExtension = stripExtension(fileName)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutPrefixNumber = withoutExtension.replace(/^\d{1,3}\s+/, "").trim();
  const fallback = withoutPrefixNumber.length > 0 ? withoutPrefixNumber : withoutExtension;

  return fallback.length > 0 ? fallback : "Untitled Track";
}

export function resolveImportedTrackTitle(input: {
  metadataTitle: string | null | undefined;
  fileName: string;
}) {
  const metadataTitle = trimToNull(input.metadataTitle);
  if (metadataTitle) {
    return metadataTitle;
  }

  return deriveTrackTitleFromFileName(input.fileName);
}

export function resolveTrackImportOrder<T>(
  candidates: Array<TrackImportOrderCandidate<T>>,
) {
  const normalized = candidates.map((candidate) => ({
    ...candidate,
    normalizedTrackNumber: normalizeMetadataTrackNumber(candidate.metadataTrackNumber),
  }));

  const trackNumberCounts = new Map<number, number>();
  for (const candidate of normalized) {
    if (candidate.normalizedTrackNumber === null) {
      continue;
    }

    const current = trackNumberCounts.get(candidate.normalizedTrackNumber) ?? 0;
    trackNumberCounts.set(candidate.normalizedTrackNumber, current + 1);
  }

  const metadataOrdered: typeof normalized = [];
  const fallbackOrdered: typeof normalized = [];

  for (const candidate of normalized) {
    if (candidate.normalizedTrackNumber === null) {
      fallbackOrdered.push(candidate);
      continue;
    }

    const count = trackNumberCounts.get(candidate.normalizedTrackNumber) ?? 0;
    if (count > 1) {
      fallbackOrdered.push(candidate);
      continue;
    }

    metadataOrdered.push(candidate);
  }

  metadataOrdered.sort((a, b) => {
    if ((a.normalizedTrackNumber ?? 0) !== (b.normalizedTrackNumber ?? 0)) {
      return (a.normalizedTrackNumber ?? 0) - (b.normalizedTrackNumber ?? 0);
    }

    return naturalNameCollator.compare(a.fileName, b.fileName);
  });

  fallbackOrdered.sort((a, b) => naturalNameCollator.compare(a.fileName, b.fileName));

  return [...metadataOrdered, ...fallbackOrdered];
}

export function assignSequentialTrackNumbers<T>(items: T[], startAt: number) {
  const safeStart = Number.isFinite(startAt) && startAt > 0 ? Math.round(startAt) : 1;

  return items.map((item, index) => ({
    item,
    trackNumber: safeStart + index,
  }));
}

export function assignAppendTrackNumbers<T>(
  input: Array<{
    item: T;
    metadataTrackNumber: number | null | undefined;
  }>,
  existingTrackNumbers: number[],
) {
  const occupied = new Set(
    existingTrackNumbers
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value)),
  );
  const finalTrackCount = occupied.size + input.length;
  const availableSlots: number[] = [];
  for (let trackNumber = 1; trackNumber <= finalTrackCount; trackNumber += 1) {
    if (!occupied.has(trackNumber)) {
      availableSlots.push(trackNumber);
    }
  }

  const preferredCounts = new Map<number, number>();
  for (const entry of input) {
    const preferred = normalizeMetadataTrackNumber(entry.metadataTrackNumber);
    if (preferred === null || preferred > finalTrackCount) {
      continue;
    }

    const count = preferredCounts.get(preferred) ?? 0;
    preferredCounts.set(preferred, count + 1);
  }

  const availableSet = new Set(availableSlots);
  const reservedTrackNumbersByIndex = new Map<number, number>();

  for (const [index, entry] of input.entries()) {
    const preferred = normalizeMetadataTrackNumber(entry.metadataTrackNumber);
    if (
      preferred === null ||
      preferred > finalTrackCount ||
      !availableSet.has(preferred) ||
      (preferredCounts.get(preferred) ?? 0) > 1
    ) {
      continue;
    }

    reservedTrackNumbersByIndex.set(index, preferred);
    availableSet.delete(preferred);
  }

  const fallbackSlots = availableSlots.filter((trackNumber) => availableSet.has(trackNumber));
  let fallbackIndex = 0;

  return input.map(({ item }, index) => {
    const reserved = reservedTrackNumbersByIndex.get(index);
    if (typeof reserved === "number") {
      return {
        item,
        trackNumber: reserved,
      };
    }

    const fallback = fallbackSlots[fallbackIndex] ?? finalTrackCount + fallbackIndex + 1;
    fallbackIndex += 1;
    return {
      item,
      trackNumber: fallback,
    };
  });
}
