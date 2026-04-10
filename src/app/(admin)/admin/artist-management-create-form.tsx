import type { ChangeEvent, FormEvent } from "react";

import {
  buttonClassName,
  getArtistUrlPreview,
  primaryButtonClassName,
  resolveArtistImageSrc,
  sanitizeUrlInput,
  slugify,
} from "./artist-management-panel-shared";

type ArtistManagementCreateFormProps = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  newName: string;
  setNewName: (value: string) => void;
  newSlug: string;
  setNewSlug: (value: string) => void;
  newImageUrl: string;
  createImageUploading: boolean;
  onArtistImageFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemoveArtistImage: () => void;
  newLocation: string;
  setNewLocation: (value: string) => void;
  newBio: string;
  setNewBio: (value: string) => void;
  createAdvancedOpen: boolean;
  setCreateAdvancedOpen: (next: boolean) => void;
  newUrlTouched: boolean;
  setNewUrlTouched: (next: boolean) => void;
  createPending: boolean;
};

export function ArtistManagementCreateForm(props: ArtistManagementCreateFormProps) {
  const {
    onSubmit,
    newName,
    setNewName,
    newSlug,
    setNewSlug,
    newImageUrl,
    createImageUploading,
    onArtistImageFileChange,
    onRemoveArtistImage,
    newLocation,
    setNewLocation,
    newBio,
    setNewBio,
    createAdvancedOpen,
    setCreateAdvancedOpen,
    newUrlTouched,
    setNewUrlTouched,
    createPending,
  } = props;

  return (
    <form onSubmit={onSubmit} className="mt-5 rounded-xl border border-slate-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">Create artist</p>
        <button
          type="button"
          onClick={() => setCreateAdvancedOpen(!createAdvancedOpen)}
          className={buttonClassName}
        >
          {createAdvancedOpen ? "Hide Advanced" : "Advanced"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
          Name (required)
          <input
            required
            maxLength={120}
            value={newName}
            onChange={(event) => {
              const value = event.target.value;
              setNewName(value);
              if (!newUrlTouched) {
                setNewSlug(slugify(value));
              }
            }}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            placeholder="Artist name"
          />
        </label>

        {createAdvancedOpen ? (
          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            URL
            <input
              maxLength={120}
              value={newSlug}
              onChange={(event) => {
                setNewSlug(sanitizeUrlInput(event.target.value));
                setNewUrlTouched(true);
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="artist-name"
            />
            <span className="text-[11px] text-zinc-500">
              Preview: {getArtistUrlPreview(newName, newSlug)}
            </span>
          </label>
        ) : null}

        <div className="sm:col-span-2">
          <p className="text-xs text-zinc-500">Artist image</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
              {resolveArtistImageSrc(newImageUrl) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveArtistImageSrc(newImageUrl) ?? ""}
                  alt={`${newName || "Artist"} image`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[11px] text-zinc-500">No image</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={buttonClassName}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  onChange={(event) => void onArtistImageFileChange(event)}
                  disabled={createPending || createImageUploading}
                  className="sr-only"
                />
                {createImageUploading ? "Uploading..." : newImageUrl ? "Replace Image" : "Upload Image"}
              </label>
              <button
                type="button"
                onClick={onRemoveArtistImage}
                disabled={!newImageUrl || createPending || createImageUploading}
                className={buttonClassName}
              >
                Remove
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Accepted formats: JPEG, PNG, WEBP, AVIF, GIF.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
          Location
          <input
            maxLength={160}
            value={newLocation}
            onChange={(event) => setNewLocation(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            placeholder="Detroit, MI"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
          Bio
          <textarea
            rows={3}
            maxLength={4_000}
            value={newBio}
            onChange={(event) => setNewBio(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            placeholder="Optional artist bio"
          />
        </label>
      </div>

      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={createPending} className={primaryButtonClassName}>
          {createPending ? "Creating..." : "Create Artist"}
        </button>
      </div>
    </form>
  );
}
