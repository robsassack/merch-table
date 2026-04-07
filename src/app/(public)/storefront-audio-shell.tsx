"use client";

import { ReleaseAudioPlayerProvider } from "@/app/(public)/release/release-audio-player";
import ReleaseFloatingPlayer from "@/app/(public)/release/release-floating-player";

type StorefrontAudioShellProps = {
  children: React.ReactNode;
};

export default function StorefrontAudioShell({ children }: StorefrontAudioShellProps) {
  return (
    <ReleaseAudioPlayerProvider>
      {children}
      <ReleaseFloatingPlayer />
    </ReleaseAudioPlayerProvider>
  );
}
