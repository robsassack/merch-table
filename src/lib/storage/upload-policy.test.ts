import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isAllowedUploadContentType,
  normalizeContentType,
  readMaxUploadSizeBytesFromEnv,
} from "@/lib/storage/upload-policy";

describe("upload policy", () => {
  it("normalizes content-type values with parameters", () => {
    assert.equal(
      normalizeContentType("audio/mpeg; charset=utf-8"),
      "audio/mpeg",
    );
  });

  it("allows supported audio types and rejects unsupported types", () => {
    assert.equal(isAllowedUploadContentType("audio/flac"), true);
    assert.equal(isAllowedUploadContentType("audio/flac; codecs=1"), true);
    assert.equal(isAllowedUploadContentType("text/plain"), false);
  });

  it("reads MAX_UPLOAD_SIZE_BYTES with a 2 GB fallback", () => {
    const prev = process.env.MAX_UPLOAD_SIZE_BYTES;
    try {
      delete process.env.MAX_UPLOAD_SIZE_BYTES;
      assert.equal(readMaxUploadSizeBytesFromEnv(), 2 * 1024 * 1024 * 1024);

      process.env.MAX_UPLOAD_SIZE_BYTES = "1048576";
      assert.equal(readMaxUploadSizeBytesFromEnv(), 1_048_576);
    } finally {
      if (prev === undefined) {
        delete process.env.MAX_UPLOAD_SIZE_BYTES;
      } else {
        process.env.MAX_UPLOAD_SIZE_BYTES = prev;
      }
    }
  });
});
