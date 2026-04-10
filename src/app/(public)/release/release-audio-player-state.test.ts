import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePlayTrackMode } from "@/app/(public)/release/release-audio-player-state";

describe("release audio player state", () => {
  it("toggles current playback when requested track matches loaded and active track", () => {
    const result = resolvePlayTrackMode({
      hasLoadedHowl: true,
      loadedTrackId: "track-1",
      resolvedActiveTrackId: "track-1",
      requestedTrackId: "track-1",
    });

    assert.equal(result, "toggle-current");
  });

  it("starts new playback when loaded audio does not match requested track", () => {
    const result = resolvePlayTrackMode({
      hasLoadedHowl: true,
      loadedTrackId: "track-from-previous-release",
      resolvedActiveTrackId: "track-clicked-in-new-release",
      requestedTrackId: "track-clicked-in-new-release",
    });

    assert.equal(result, "start-new");
  });

  it("starts new playback when there is no loaded howl", () => {
    const result = resolvePlayTrackMode({
      hasLoadedHowl: false,
      loadedTrackId: null,
      resolvedActiveTrackId: "track-1",
      requestedTrackId: "track-1",
    });

    assert.equal(result, "start-new");
  });
});

