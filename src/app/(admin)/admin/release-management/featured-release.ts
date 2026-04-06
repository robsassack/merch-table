import type { ReleaseRecord } from "./types";

export function isReleaseEligibleForFeatured(release: ReleaseRecord) {
  return release.deletedAt === null && release.status === "PUBLISHED";
}

export function resolveNormalizedFeaturedReleaseId(input: {
  currentFeaturedReleaseId: string | null;
  releases: ReleaseRecord[];
}) {
  const enabledReleases = input.releases.filter(isReleaseEligibleForFeatured);
  if (enabledReleases.length === 0) {
    return null;
  }

  const currentFeaturedRelease = input.currentFeaturedReleaseId
    ? input.releases.find((release) => release.id === input.currentFeaturedReleaseId) ?? null
    : null;

  if (currentFeaturedRelease && isReleaseEligibleForFeatured(currentFeaturedRelease)) {
    return currentFeaturedRelease.id;
  }

  return enabledReleases[0].id;
}
