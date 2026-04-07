"use client";

import { useEffect } from "react";

import {
  useReleaseAudioPlayer,
  type ReleaseAudioPlayerConfig,
} from "@/app/(public)/release/release-audio-player";

type ReleaseAudioPlayerConfiguratorProps = ReleaseAudioPlayerConfig;

export default function ReleaseAudioPlayerConfigurator(
  config: ReleaseAudioPlayerConfiguratorProps,
) {
  const { configureReleasePlayback } = useReleaseAudioPlayer();

  useEffect(() => {
    configureReleasePlayback(config);
  }, [config, configureReleasePlayback]);

  return null;
}
