import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignAppendTrackNumbers,
  assignSequentialTrackNumbers,
  normalizeDetectedDurationMs,
  resolveImportedTrackTitle,
  resolveTrackImportOrder,
} from "@/lib/audio/track-import";

describe("track import metadata", () => {
  it("prefers metadata title and falls back to filename cleanup", () => {
    assert.equal(
      resolveImportedTrackTitle({
        metadataTitle: "  Tagged Title  ",
        fileName: "01-untitled-demo.flac",
      }),
      "Tagged Title",
    );

    assert.equal(
      resolveImportedTrackTitle({
        metadataTitle: "   ",
        fileName: "02_my-new_song.mp3",
      }),
      "my new song",
    );
  });

  it("normalizes detected duration values", () => {
    assert.equal(normalizeDetectedDurationMs(null), null);
    assert.equal(normalizeDetectedDurationMs(undefined), null);
    assert.equal(normalizeDetectedDurationMs(-10), null);
    assert.equal(normalizeDetectedDurationMs(0), null);
    assert.equal(normalizeDetectedDurationMs(181_250.7), 181_251);
  });
});

describe("track import ordering", () => {
  it("orders by unique metadata track number first, then natural filename fallback", () => {
    const ordered = resolveTrackImportOrder([
      { id: "c", fileName: "03-Crowd.wav", metadataTrackNumber: null },
      { id: "a", fileName: "10-Intro.wav", metadataTrackNumber: 2 },
      { id: "b", fileName: "01-Theme.wav", metadataTrackNumber: 1 },
      { id: "d", fileName: "02-Alt.wav", metadataTrackNumber: 2 },
      { id: "e", fileName: "11-Outro.wav", metadataTrackNumber: null },
    ]);

    assert.deepEqual(
      ordered.map((entry) => entry.id),
      ["b", "d", "c", "a", "e"],
    );
  });

  it("assigns sequential track numbers for append and replace imports", () => {
    const ordered = resolveTrackImportOrder([
      { id: "first", fileName: "02-Beta.wav", metadataTrackNumber: 2 },
      { id: "second", fileName: "01-Alpha.wav", metadataTrackNumber: 1 },
      { id: "third", fileName: "03-Gamma.wav", metadataTrackNumber: null },
    ]);

    const appendNumbers = assignSequentialTrackNumbers(ordered, 6);
    assert.deepEqual(
      appendNumbers.map((item) => ({ id: item.item.id, trackNumber: item.trackNumber })),
      [
        { id: "second", trackNumber: 6 },
        { id: "first", trackNumber: 7 },
        { id: "third", trackNumber: 8 },
      ],
    );

    const replaceNumbers = assignSequentialTrackNumbers(ordered, 1);
    assert.deepEqual(
      replaceNumbers.map((item) => ({ id: item.item.id, trackNumber: item.trackNumber })),
      [
        { id: "second", trackNumber: 1 },
        { id: "first", trackNumber: 2 },
        { id: "third", trackNumber: 3 },
      ],
    );
  });

  it("keeps append imports on free metadata slots when they do not conflict", () => {
    const ordered = resolveTrackImportOrder([
      { id: "two", fileName: "02-two.wav", metadataTrackNumber: 2 },
      { id: "three", fileName: "03-three.wav", metadataTrackNumber: 3 },
      { id: "free", fileName: "04-free.wav", metadataTrackNumber: 4 },
      { id: "none", fileName: "05-none.wav", metadataTrackNumber: null },
    ]);

    const appendNumbers = assignAppendTrackNumbers(
      ordered.map((item) => ({
        item,
        metadataTrackNumber: item.metadataTrackNumber,
      })),
      [1, 2, 5],
    );

    assert.deepEqual(
      appendNumbers.map((entry) => ({
        id: entry.item.id,
        trackNumber: entry.trackNumber,
      })),
      [
        { id: "two", trackNumber: 6 },
        { id: "three", trackNumber: 3 },
        { id: "free", trackNumber: 4 },
        { id: "none", trackNumber: 7 },
      ],
    );
  });
});
