export type ArtistRecord = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  bio: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    releases: number;
  };
};

export type ArtistsListResponse = {
  ok?: boolean;
  error?: string;
  artists?: ArtistRecord[];
};

export type ArtistMutationResponse = {
  ok?: boolean;
  error?: string;
  artist?: ArtistRecord;
  purgedArtistId?: string;
};

export type ArtistDraft = {
  name: string;
  slug: string;
  location: string;
  bio: string;
};

export const buttonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

export const dangerButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-red-800/80 bg-red-950/70 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/70 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50";

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "artist";
}

export function sanitizeUrlInput(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getArtistUrlPreview(name: string, slug: string) {
  const custom = sanitizeUrlInput(slug);
  const resolved = custom.length > 0 ? custom : slugify(name);
  return `/artist/${resolved}`;
}

export function getMutationError(responseBody: ArtistMutationResponse | null, fallback: string) {
  if (responseBody?.error && responseBody.error.length > 0) {
    return responseBody.error;
  }

  return fallback;
}
