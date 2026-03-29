import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCoverStorageKey,
  isAllowedCoverImageContentType,
  isValidCoverStorageKey,
  readMaxCoverUploadSizeBytesFromEnv,
} from "@/lib/storage/cover-art";

describe("cover art policy", () => {
  it("supports common image mime types", () => {
    assert.equal(isAllowedCoverImageContentType("image/png"), true);
    assert.equal(isAllowedCoverImageContentType("image/jpeg; charset=utf-8"), true);
    assert.equal(isAllowedCoverImageContentType("audio/mpeg"), false);
  });

  it("reads MAX_COVER_UPLOAD_SIZE_BYTES with a fallback", () => {
    const previous = process.env.MAX_COVER_UPLOAD_SIZE_BYTES;

    try {
      delete process.env.MAX_COVER_UPLOAD_SIZE_BYTES;
      assert.equal(readMaxCoverUploadSizeBytesFromEnv(), 25 * 1024 * 1024);

      process.env.MAX_COVER_UPLOAD_SIZE_BYTES = "1048576";
      assert.equal(readMaxCoverUploadSizeBytesFromEnv(), 1_048_576);
    } finally {
      if (previous === undefined) {
        delete process.env.MAX_COVER_UPLOAD_SIZE_BYTES;
      } else {
        process.env.MAX_COVER_UPLOAD_SIZE_BYTES = previous;
      }
    }
  });

  it("builds and validates cover storage keys", () => {
    const key = buildCoverStorageKey("My Cover!.png");
    assert.equal(key.startsWith("admin/covers/"), true);
    assert.equal(isValidCoverStorageKey(key), true);
    assert.equal(isValidCoverStorageKey("../escape"), false);
    assert.equal(isValidCoverStorageKey("admin/uploads/other"), false);
  });
});
