"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Howl } from "howler";

export type ReleaseAudioTrack = {
  id: string;
  title: string;
  artistName: string;
  trackNumber: number;
  durationMs: number | null;
  previewUrl: string;
  previewFormat: string | null;
  isPlayablePreview: boolean;
};

type ReleaseAudioPlayerContextValue = {
  tracks: ReleaseAudioTrack[];
  hasPlayableTracks: boolean;
  hasPlaybackStarted: boolean;
  activeTrackId: string | null;
  activeTrack: ReleaseAudioTrack | null;
  isPlaying: boolean;
  isPlaybackVisuallyActive: boolean;
  currentTimeSeconds: number;
  durationSeconds: number;
  playTrack: (trackId: string) => void;
  toggleActiveTrackPlayback: () => void;
  seekToFraction: (value: number) => void;
  beginVisualPlaybackHold: () => void;
  endVisualPlaybackHold: () => void;
};

type ReleaseAudioPlayerProviderProps = {
  tracks: ReleaseAudioTrack[];
  featuredTrackId: string | null;
  children: React.ReactNode;
};

const ReleaseAudioPlayerContext = createContext<ReleaseAudioPlayerContextValue | null>(null);

function resolveDefaultTrackId(tracks: ReleaseAudioTrack[], featuredTrackId: string | null) {
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

function resolveHowlSeekSeconds(sound: Howl, soundId: number | null) {
  const seekValue = soundId !== null ? sound.seek(soundId) : sound.seek();
  return typeof seekValue === "number" && Number.isFinite(seekValue) ? seekValue : 0;
}

function normalizeHowlerFormat(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "mp3" || normalized === "mpeg") {
    return "mp3";
  }

  if (normalized === "m4a" || normalized === "mp4" || normalized === "aac") {
    return "m4a";
  }

  if (normalized === "flac") {
    return "flac";
  }

  if (normalized === "wav" || normalized === "wave") {
    return "wav";
  }

  if (normalized === "ogg" || normalized === "oga" || normalized === "opus") {
    return "ogg";
  }

  if (normalized === "webm" || normalized === "weba") {
    return "webm";
  }

  return null;
}

export function ReleaseAudioPlayerProvider({
  tracks,
  featuredTrackId,
  children,
}: ReleaseAudioPlayerProviderProps) {
  const playableTracks = useMemo(
    () => tracks.filter((track) => track.isPlayablePreview),
    [tracks],
  );
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const defaultTrackId = useMemo(
    () => resolveDefaultTrackId(tracks, featuredTrackId),
    [featuredTrackId, tracks],
  );
  const hasPlayableTracks = defaultTrackId !== null;

  const [activeTrackId, setActiveTrackId] = useState<string | null>(defaultTrackId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [visualPlaybackHoldCount, setVisualPlaybackHoldCount] = useState(0);

  const howlRef = useRef<Howl | null>(null);
  const activeHowlSoundIdRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackSessionRef = useRef(0);
  const playTrackRef = useRef<(trackId: string) => void>(() => {});

  const stopProgressLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const stopAndUnloadHowl = useCallback(() => {
    stopProgressLoop();
    activeHowlSoundIdRef.current = null;
    if (!howlRef.current) {
      return;
    }

    howlRef.current.stop();
    howlRef.current.unload();
    howlRef.current = null;
  }, [stopProgressLoop]);

  const resolvedActiveTrackId = useMemo(() => {
    if (!activeTrackId) {
      return defaultTrackId;
    }

    const currentTrack = trackById.get(activeTrackId);
    if (currentTrack?.isPlayablePreview) {
      return activeTrackId;
    }

    return defaultTrackId;
  }, [activeTrackId, defaultTrackId, trackById]);

  const updateProgressFromHowl = useCallback(() => {
    const sound = howlRef.current;
    if (!sound) {
      return;
    }

    const nextDuration = sound.duration();
    const safeDuration = Number.isFinite(nextDuration) ? nextDuration : 0;
    setDurationSeconds(safeDuration > 0 ? safeDuration : 0);
    setCurrentTimeSeconds(resolveHowlSeekSeconds(sound, activeHowlSoundIdRef.current));
  }, []);

  const runProgressLoop = useCallback(() => {
    stopProgressLoop();

    const tick = () => {
      const sound = howlRef.current;
      if (!sound) {
        animationFrameRef.current = null;
        return;
      }

      updateProgressFromHowl();
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }, [stopProgressLoop, updateProgressFromHowl]);

  const playTrack = useCallback(
    (trackId: string) => {
      const requestedTrack = trackById.get(trackId);
      if (!requestedTrack || !requestedTrack.isPlayablePreview) {
        return;
      }

      const currentHowl = howlRef.current;
      if (currentHowl && resolvedActiveTrackId === requestedTrack.id) {
        const activeSoundId = activeHowlSoundIdRef.current;
        const isActiveSoundPlaying =
          activeSoundId !== null ? currentHowl.playing(activeSoundId) : currentHowl.playing();

        if (isActiveSoundPlaying) {
          if (activeSoundId !== null) {
            currentHowl.pause(activeSoundId);
          } else {
            currentHowl.pause();
          }
          return;
        }

        const resumedSoundId =
          activeSoundId !== null ? currentHowl.play(activeSoundId) : currentHowl.play();
        if (typeof resumedSoundId === "number" && Number.isFinite(resumedSoundId)) {
          activeHowlSoundIdRef.current = resumedSoundId;
        }
        return;
      }

      stopAndUnloadHowl();
      setIsPlaying(false);
      setCurrentTimeSeconds(0);
      setDurationSeconds(
        requestedTrack.durationMs && requestedTrack.durationMs > 0
          ? requestedTrack.durationMs / 1000
          : 0,
      );
      setActiveTrackId(requestedTrack.id);

      const playbackSession = playbackSessionRef.current + 1;
      playbackSessionRef.current = playbackSession;

      const sound = new Howl({
        src: [requestedTrack.previewUrl],
        format: requestedTrack.previewFormat
          ? [normalizeHowlerFormat(requestedTrack.previewFormat) ?? requestedTrack.previewFormat]
          : undefined,
        html5: true,
        preload: true,
        onload: () => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          updateProgressFromHowl();
        },
        onplay: (soundId) => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          if (typeof soundId === "number" && Number.isFinite(soundId)) {
            activeHowlSoundIdRef.current = soundId;
          }
          setHasPlaybackStarted(true);
          setIsPlaying(true);
          updateProgressFromHowl();
          runProgressLoop();
        },
        onpause: (soundId) => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          if (
            typeof soundId === "number" &&
            Number.isFinite(soundId) &&
            activeHowlSoundIdRef.current !== null &&
            soundId !== activeHowlSoundIdRef.current
          ) {
            return;
          }
          setIsPlaying(false);
          stopProgressLoop();
          updateProgressFromHowl();
        },
        onstop: (soundId) => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          if (
            typeof soundId === "number" &&
            Number.isFinite(soundId) &&
            activeHowlSoundIdRef.current !== null &&
            soundId !== activeHowlSoundIdRef.current
          ) {
            return;
          }
          activeHowlSoundIdRef.current = null;
          setIsPlaying(false);
          stopProgressLoop();
          setCurrentTimeSeconds(0);
          updateProgressFromHowl();
        },
        onend: (soundId) => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          if (
            typeof soundId === "number" &&
            Number.isFinite(soundId) &&
            activeHowlSoundIdRef.current !== null &&
            soundId !== activeHowlSoundIdRef.current
          ) {
            return;
          }

          const finishedTrackIndex = playableTracks.findIndex(
            (track) => track.id === requestedTrack.id,
          );
          const nextPlayableTrack =
            finishedTrackIndex >= 0 ? playableTracks[finishedTrackIndex + 1] ?? null : null;
          if (nextPlayableTrack) {
            playTrackRef.current(nextPlayableTrack.id);
            return;
          }

          activeHowlSoundIdRef.current = null;
          setIsPlaying(false);
          setHasPlaybackStarted(false);
          stopProgressLoop();
          updateProgressFromHowl();
        },
        onloaderror: () => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          setIsPlaying(false);
          stopProgressLoop();
          // Fail silently for unavailable previews; UI falls back to idle state.
        },
        onplayerror: () => {
          if (playbackSessionRef.current !== playbackSession) {
            return;
          }
          setIsPlaying(false);
          stopProgressLoop();
          // Browser playback restrictions are handled quietly in the background.
        },
      });

      howlRef.current = sound;
      const startedSoundId = sound.play();
      if (typeof startedSoundId === "number" && Number.isFinite(startedSoundId)) {
        activeHowlSoundIdRef.current = startedSoundId;
      }
    },
    [
      runProgressLoop,
      resolvedActiveTrackId,
      playableTracks,
      stopAndUnloadHowl,
      stopProgressLoop,
      trackById,
      updateProgressFromHowl,
    ],
  );

  useEffect(() => {
    playTrackRef.current = playTrack;
  }, [playTrack]);

  const toggleActiveTrackPlayback = useCallback(() => {
    if (resolvedActiveTrackId) {
      const activeTrack = trackById.get(resolvedActiveTrackId);
      if (activeTrack?.isPlayablePreview) {
        playTrack(activeTrack.id);
        return;
      }
    }

    if (defaultTrackId) {
      playTrack(defaultTrackId);
    }
  }, [defaultTrackId, playTrack, resolvedActiveTrackId, trackById]);

  const seekToFraction = useCallback((value: number) => {
    const sound = howlRef.current;
    if (!sound) {
      return;
    }

    const clampedValue = Math.max(0, Math.min(1, value));
    const soundDuration = sound.duration();
    if (!Number.isFinite(soundDuration) || soundDuration <= 0) {
      return;
    }

    const nextTime = soundDuration * clampedValue;
    const activeSoundId = activeHowlSoundIdRef.current;
    if (activeSoundId !== null) {
      sound.seek(nextTime, activeSoundId);
    } else {
      sound.seek(nextTime);
    }
    setCurrentTimeSeconds(nextTime);
    setDurationSeconds(soundDuration);
  }, []);

  const beginVisualPlaybackHold = useCallback(() => {
    setVisualPlaybackHoldCount((current) => current + 1);
  }, []);

  const endVisualPlaybackHold = useCallback(() => {
    setVisualPlaybackHoldCount((current) => (current > 0 ? current - 1 : 0));
  }, []);

  const isPlaybackVisuallyActive = isPlaying || visualPlaybackHoldCount > 0;

  useEffect(() => {
    if (!activeTrackId) {
      return;
    }

    const activeTrack = trackById.get(activeTrackId);
    if (activeTrack?.isPlayablePreview) {
      return;
    }

    stopAndUnloadHowl();
  }, [activeTrackId, stopAndUnloadHowl, trackById]);

  useEffect(() => {
    return () => {
      stopAndUnloadHowl();
    };
  }, [stopAndUnloadHowl]);

  const activeTrack = useMemo(
    () =>
      resolvedActiveTrackId ? trackById.get(resolvedActiveTrackId) ?? null : null,
    [resolvedActiveTrackId, trackById],
  );

  const contextValue = useMemo<ReleaseAudioPlayerContextValue>(
    () => ({
      tracks,
      hasPlayableTracks,
      hasPlaybackStarted,
      activeTrackId: resolvedActiveTrackId,
      activeTrack,
      isPlaying,
      isPlaybackVisuallyActive,
      currentTimeSeconds,
      durationSeconds,
      playTrack,
      toggleActiveTrackPlayback,
      seekToFraction,
      beginVisualPlaybackHold,
      endVisualPlaybackHold,
    }),
    [
      activeTrack,
      resolvedActiveTrackId,
      beginVisualPlaybackHold,
      currentTimeSeconds,
      durationSeconds,
      endVisualPlaybackHold,
      hasPlayableTracks,
      hasPlaybackStarted,
      isPlaying,
      isPlaybackVisuallyActive,
      playTrack,
      seekToFraction,
      toggleActiveTrackPlayback,
      tracks,
    ],
  );

  return (
    <ReleaseAudioPlayerContext.Provider value={contextValue}>
      {children}
    </ReleaseAudioPlayerContext.Provider>
  );
}

export function useReleaseAudioPlayer() {
  const context = useContext(ReleaseAudioPlayerContext);
  if (!context) {
    throw new Error("useReleaseAudioPlayer must be used within ReleaseAudioPlayerProvider.");
  }

  return context;
}
