"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ArtistImageDialogProps = {
  artistName: string;
  imageUrl: string;
};

export function ArtistImageDialog({ artistName, imageUrl }: ArtistImageDialogProps) {
  const [open, setOpen] = useState(false);
  const canUsePortal = typeof document !== "undefined";

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-16 w-16 shrink-0 cursor-zoom-in overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 transition hover:border-zinc-300"
        aria-label={`View larger image for ${artistName}`}
      >
        <Image
          src={imageUrl}
          alt={`${artistName} profile`}
          width={64}
          height={64}
          className="h-full w-full object-cover"
        />
      </button>

      {canUsePortal && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm sm:p-6"
              onClick={() => setOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={`${artistName} image preview`}
            >
              <div
                className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/20 bg-zinc-900/95 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.75)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/15 bg-zinc-900/90 px-4 py-3">
                  <p className="truncate text-sm font-semibold tracking-tight text-zinc-100">
                    {artistName}
                  </p>
                  <button
                    type="button"
                    className="rounded-md border border-white/30 bg-zinc-800/90 px-3 py-1 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700"
                    onClick={() => setOpen(false)}
                    aria-label="Close image dialog"
                  >
                    Close
                  </button>
                </div>

                <div className="flex max-h-[calc(92vh-56px)] items-center justify-center bg-zinc-950 p-3 sm:p-5">
                  <Image
                    src={imageUrl}
                    alt={`${artistName} profile enlarged`}
                    width={1600}
                    height={1600}
                    sizes="92vw"
                    className="max-h-[calc(92vh-110px)] w-auto max-w-full rounded-xl border border-white/15 bg-white object-contain shadow-xl"
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
