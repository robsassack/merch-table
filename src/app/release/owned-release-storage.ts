export const OWNED_RELEASE_STORAGE_KEY = "merch-table-owned-releases-v1";

type OwnedReleaseMap = Record<string, number>;

function parseOwnedReleaseMap(raw: string | null): OwnedReleaseMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: OwnedReleaseMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key !== "string" || key.trim().length === 0) {
        continue;
      }

      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function readOwnedReleaseMapFromStorage(storage: Storage): OwnedReleaseMap {
  return parseOwnedReleaseMap(storage.getItem(OWNED_RELEASE_STORAGE_KEY));
}

export function writeOwnedReleaseMapToStorage(storage: Storage, value: OwnedReleaseMap) {
  storage.setItem(OWNED_RELEASE_STORAGE_KEY, JSON.stringify(value));
}

export function markOwnedReleaseInStorage(storage: Storage, releaseId: string) {
  const normalizedId = releaseId.trim();
  if (normalizedId.length === 0) {
    return;
  }

  const current = readOwnedReleaseMapFromStorage(storage);
  current[normalizedId] = Date.now();
  writeOwnedReleaseMapToStorage(storage, current);
}

export function isReleaseOwnedInStorage(storage: Storage, releaseId: string) {
  const normalizedId = releaseId.trim();
  if (normalizedId.length === 0) {
    return false;
  }

  const current = readOwnedReleaseMapFromStorage(storage);
  return typeof current[normalizedId] === "number";
}
