"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

type UploadUrlResponse = {
  ok?: boolean;
  error?: string;
  storageProvider?: "MINIO" | "S3";
  bucket?: string;
  storageKey?: string;
  uploadUrl?: string;
  expiresInSeconds?: number;
  requiredHeaders?: Record<string, string>;
};

type UploadedAssetDraft = {
  fileName: string;
  sizeBytes: number;
  contentType: string;
  storageProvider: "MINIO" | "S3";
  bucket: string;
  storageKey: string;
};

type AudioQualityMetrics = {
  bitrateKbps: number;
  sampleRateHz: number;
};

type UploadQualityValidationMode = "ENFORCE" | "WARN" | "OFF";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/aiff",
  "audio/x-aiff",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  webm: "audio/webm",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};
const SUPPORTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".ogg",
  ".webm",
  ".aif",
  ".aiff",
];

function readThresholdFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function readQualityValidationModeFromEnv(): UploadQualityValidationMode {
  const raw = process.env.NEXT_PUBLIC_UPLOAD_QUALITY_MODE?.trim().toUpperCase();
  if (raw === "WARN" || raw === "OFF" || raw === "ENFORCE") {
    return raw;
  }

  return "WARN";
}

const MIN_UPLOAD_BITRATE_KBPS = readThresholdFromEnv(
  "NEXT_PUBLIC_MIN_UPLOAD_BITRATE_KBPS",
  192,
);
const MIN_UPLOAD_SAMPLE_RATE_HZ = readThresholdFromEnv(
  "NEXT_PUBLIC_MIN_UPLOAD_SAMPLE_RATE_HZ",
  44_100,
);
const UPLOAD_QUALITY_VALIDATION_MODE = readQualityValidationModeFromEnv();

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function resolveAudioMimeType(file: File) {
  const fromBrowser = file.type?.trim().toLowerCase();
  if (fromBrowser) {
    return fromBrowser;
  }

  const extension = getFileExtension(file.name);
  return EXTENSION_TO_MIME[extension] ?? "";
}

async function readAudioQualityMetrics(file: File): Promise<AudioQualityMetrics> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error("This browser cannot validate audio quality metadata.");
  }

  const context = new AudioContextCtor();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));

    const durationSeconds = audioBuffer.duration;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Could not read audio duration.");
    }

    const bitrateKbps = Math.round((file.size * 8) / durationSeconds / 1_000);
    const sampleRateHz = Math.round(audioBuffer.sampleRate);

    return { bitrateKbps, sampleRateHz };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function validateFilesBeforeUpload(files: File[]) {
  const blockingErrors: string[] = [];
  const qualityWarnings: string[] = [];

  for (const file of files) {
    const mimeType = resolveAudioMimeType(file);
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      blockingErrors.push(
        `${file.name}: unsupported file type (${mimeType || "unknown"}).`,
      );
      continue;
    }

    if (UPLOAD_QUALITY_VALIDATION_MODE === "OFF") {
      continue;
    }

    try {
      const metrics = await readAudioQualityMetrics(file);
      if (metrics.bitrateKbps < MIN_UPLOAD_BITRATE_KBPS) {
        const message = `${file.name}: bitrate ${metrics.bitrateKbps} kbps is below minimum ${MIN_UPLOAD_BITRATE_KBPS} kbps.`;
        if (UPLOAD_QUALITY_VALIDATION_MODE === "ENFORCE") {
          blockingErrors.push(message);
        } else {
          qualityWarnings.push(message);
        }
      }

      if (metrics.sampleRateHz < MIN_UPLOAD_SAMPLE_RATE_HZ) {
        const message = `${file.name}: sample rate ${metrics.sampleRateHz} Hz is below minimum ${MIN_UPLOAD_SAMPLE_RATE_HZ} Hz.`;
        if (UPLOAD_QUALITY_VALIDATION_MODE === "ENFORCE") {
          blockingErrors.push(message);
        } else {
          qualityWarnings.push(message);
        }
      }
    } catch (error) {
      const message = `${file.name}: could not validate bitrate/sample rate (${error instanceof Error ? error.message : "unknown error"}).`;
      if (UPLOAD_QUALITY_VALIDATION_MODE === "ENFORCE") {
        blockingErrors.push(message);
      } else {
        qualityWarnings.push(message);
      }
    }
  }

  return { blockingErrors, qualityWarnings };
}

function uploadViaSignedPut(input: {
  uploadUrl: string;
  file: File;
  contentType: string;
  requiredHeaders: Record<string, string>;
  onProgress: (percent: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.uploadUrl);

    // Browser sets content-length automatically for File/Blob bodies.
    xhr.setRequestHeader(
      "content-type",
      input.requiredHeaders["content-type"] ?? input.contentType,
    );

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      const percent = Math.max(
        0,
        Math.min(100, Math.round((event.loaded / event.total) * 100)),
      );
      input.onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(100);
        resolve();
        return;
      }

      reject(new Error(`Upload failed with status ${xhr.status}.`));
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed due to a network error."));
    };

    xhr.send(input.file);
  });
}

export function AssetUploadPanel() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAssetDraft[]>([]);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);

  const progressLabel = useMemo(() => {
    if (!isUploading && uploadProgress <= 0) {
      return "Idle";
    }

    if (uploadProgress >= 100 && !isUploading) {
      return "Upload complete";
    }

    return `${uploadProgress}%`;
  }, [isUploading, uploadProgress]);

  const onSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setSelectedFiles(nextFiles);
    setUploadProgress(0);
    setUploadedAssets([]);
    setError(null);
    setValidationIssues([]);
    setFailedFiles([]);
    setNotice(null);
    setSaveNotice(null);
  };

  const onDropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (isUploading || isSaving) {
      return;
    }

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    if (droppedFiles.length === 0) {
      return;
    }

    setSelectedFiles(droppedFiles);
    setUploadProgress(0);
    setUploadedAssets([]);
    setError(null);
    setValidationIssues([]);
    setFailedFiles([]);
    setNotice(null);
    setSaveNotice(null);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploading && !isSaving) {
      setIsDragging(true);
    }
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploading && !isSaving) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDragging(false);
  };

  const uploadFiles = async (filesToUpload: File[], isRetry: boolean) => {
    if (filesToUpload.length === 0 || isUploading) {
      return;
    }

    setError(null);
    if (!isRetry) {
      setValidationIssues([]);
    }
    setFailedFiles([]);
    setNotice(null);
    setSaveNotice(null);
    setUploadProgress(0);
    setIsUploading(true);

    try {
      if (!isRetry) {
        setUploadedAssets([]);
      }

      const validationResult = await validateFilesBeforeUpload(filesToUpload);
      const nextIssues =
        UPLOAD_QUALITY_VALIDATION_MODE === "ENFORCE"
          ? validationResult.blockingErrors
          : validationResult.qualityWarnings;
      setValidationIssues(nextIssues);

      if (validationResult.blockingErrors.length > 0) {
        throw new Error("One or more files failed pre-upload validation.");
      }

      const totalBytes = filesToUpload.reduce((sum, file) => sum + file.size, 0);
      const loadedByFile = new Array(filesToUpload.length).fill(0) as number[];
      const updateOverallProgress = () => {
        if (totalBytes <= 0) {
          setUploadProgress(0);
          return;
        }

        const loaded = loadedByFile.reduce((sum, value) => sum + value, 0);
        const percent = Math.max(
          0,
          Math.min(100, Math.round((loaded / totalBytes) * 100)),
        );
        setUploadProgress(percent);
      };

      const uploadResults = await Promise.all(
        filesToUpload.map(async (selectedFile, fileIndex) => {
          const contentType =
            selectedFile.type.trim().length > 0
              ? selectedFile.type
              : "application/octet-stream";

          const uploadUrlResponse = await fetch("/api/admin/assets/upload-url", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fileName: selectedFile.name,
              contentType,
              sizeBytes: selectedFile.size,
            }),
          });

          const uploadUrlBody = (await uploadUrlResponse
            .json()
            .catch(() => null)) as UploadUrlResponse | null;

          if (
            !uploadUrlResponse.ok ||
            !uploadUrlBody?.ok ||
            !uploadUrlBody.uploadUrl ||
            !uploadUrlBody.storageKey ||
            !uploadUrlBody.bucket ||
            !uploadUrlBody.storageProvider
          ) {
            throw new Error(
              uploadUrlBody?.error ??
                `Could not create upload URL for ${selectedFile.name}.`,
            );
          }

          await uploadViaSignedPut({
            uploadUrl: uploadUrlBody.uploadUrl,
            file: selectedFile,
            contentType,
            requiredHeaders: uploadUrlBody.requiredHeaders ?? {},
            onProgress: (filePercent) => {
              loadedByFile[fileIndex] = Math.round(
                (Math.max(0, Math.min(100, filePercent)) / 100) * selectedFile.size,
              );
              updateOverallProgress();
            },
          });

          loadedByFile[fileIndex] = selectedFile.size;
          updateOverallProgress();

          return {
            ok: true as const,
            file: selectedFile,
            asset: {
              fileName: selectedFile.name,
              sizeBytes: selectedFile.size,
              contentType,
              storageProvider: uploadUrlBody.storageProvider,
              bucket: uploadUrlBody.bucket,
              storageKey: uploadUrlBody.storageKey,
            },
          };
        }).map((p, idx) =>
          p.catch((error) => ({
            ok: false as const,
            error,
            file: filesToUpload[idx],
          })),
        ),
      );

      const successfulUploads = uploadResults
        .filter((result): result is { ok: true; file: File; asset: UploadedAssetDraft } =>
          result.ok,
        )
        .map((result) => result.asset);

      const nextFailedFiles = uploadResults
        .filter((result): result is { ok: false; error: unknown; file: File } => !result.ok)
        .map((result) => result.file);

      if (successfulUploads.length > 0) {
        setUploadedAssets((current) => {
          const seen = new Set(current.map((asset) => asset.storageKey));
          const appended = successfulUploads.filter(
            (asset) => !seen.has(asset.storageKey),
          );
          return [...current, ...appended];
        });
      }

      setFailedFiles(nextFailedFiles);

      if (nextFailedFiles.length > 0) {
        const baseMessage = isRetry
          ? `Retried ${filesToUpload.length} file${filesToUpload.length === 1 ? "" : "s"}`
          : `Uploaded ${successfulUploads.length} of ${filesToUpload.length} file${filesToUpload.length === 1 ? "" : "s"}`;
        setError(`${baseMessage}. ${nextFailedFiles.length} failed. You can retry.`);
      } else if (successfulUploads.length > 0) {
        setNotice(
          `${successfulUploads.length} file${successfulUploads.length === 1 ? "" : "s"} uploaded. You can save this draft now.`,
        );
      }

      if (nextFailedFiles.length === filesToUpload.length) {
        return;
      }

      if (nextFailedFiles.length > 0) {
        return;
      }

      setNotice(
        `${successfulUploads.length} file${successfulUploads.length === 1 ? "" : "s"} uploaded. You can save this draft now.`,
      );
    } catch (uploadError) {
      setFailedFiles(filesToUpload);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await uploadFiles(selectedFiles, false);
  };

  const onRetryFailed = async () => {
    await uploadFiles(failedFiles, true);
  };

  const onSave = async () => {
    if (uploadedAssets.length === 0 || isUploading || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveNotice(null);

    try {
      window.sessionStorage.setItem(
        "admin:last-uploaded-asset-draft",
        JSON.stringify(uploadedAssets),
      );
      setSaveNotice("Saved upload draft in this browser session.");
    } catch {
      setSaveNotice("Upload is complete. Could not persist draft in this browser.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-700/80 bg-slate-950/60 p-5">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
        Asset Upload
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Select a file, upload directly to storage, then save the draft metadata.
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Validation before upload: allowed audio types only, minimum bitrate{" "}
        {MIN_UPLOAD_BITRATE_KBPS} kbps, minimum sample rate {MIN_UPLOAD_SAMPLE_RATE_HZ} Hz.
        {" "}
        Mode: {UPLOAD_QUALITY_VALIDATION_MODE.toLowerCase()}.
      </p>

      <form onSubmit={onUpload} className="mt-5 flex flex-col gap-4">
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropFiles}
          className={`rounded-xl border-2 border-dashed px-4 py-5 text-sm transition ${
            isDragging
              ? "border-emerald-300 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(110,231,183,0.45)]"
              : "border-slate-500/70 bg-slate-900/70"
          } ${isUploading || isSaving ? "opacity-60" : ""}`}
        >
          <label className="flex cursor-pointer flex-col gap-2 text-sm text-slate-200">
            <span className="font-semibold tracking-tight text-slate-100">
              Drag and drop files here, or click to browse
            </span>
            <span className="text-xs text-slate-400">
              Supported file types: {SUPPORTED_AUDIO_EXTENSIONS.join(", ")}
            </span>
            <span className="inline-flex w-fit items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100">
              Browse files
            </span>
            <input
              type="file"
              multiple
              onChange={onSelectFile}
              disabled={isUploading || isSaving}
              className="sr-only"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-600/80 bg-slate-900/65 px-4 py-4 text-sm text-slate-300">
          <p className="text-slate-200">
            <span className="font-semibold text-slate-100">Files selected:</span>{" "}
            {selectedFiles.length}
          </p>
          <p className="mt-1 text-slate-200">
            <span className="font-semibold text-slate-100">Total size:</span>{" "}
            {selectedFiles.length > 0
              ? formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))
              : "—"}
          </p>
          {selectedFiles.length > 0 ? (
            <ul className="mt-3 max-h-36 space-y-2 overflow-auto rounded-lg border border-slate-700/70 bg-slate-950/60 p-2 text-xs text-slate-300">
              {selectedFiles.map((file) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-900/70 px-2 py-1.5"
                >
                  <span className="truncate text-slate-100">{file.name}</span>
                  <span className="shrink-0 text-slate-400">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-zinc-600">
            <span>Upload progress</span>
            <span>{progressLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-150"
              style={{ width: `${uploadProgress}%` }}
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={selectedFiles.length === 0 || isUploading || isSaving}
            className="inline-flex w-fit items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          >
            {isUploading
              ? "Uploading..."
              : `Upload ${selectedFiles.length > 0 ? selectedFiles.length : ""} File${selectedFiles.length === 1 ? "" : "s"}`.trim()}
          </button>

          <button
            type="button"
            onClick={onRetryFailed}
            disabled={failedFiles.length === 0 || isUploading || isSaving}
            className="inline-flex w-fit items-center rounded-lg border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Retry Failed Uploads
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={uploadedAssets.length === 0 || isUploading || isSaving}
            className="inline-flex w-fit items-center rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>

          {isUploading ? (
            <p className="text-xs text-zinc-600">Save is disabled while upload is in progress.</p>
          ) : null}
          {failedFiles.length > 0 && !isUploading ? (
            <p className="text-xs text-amber-300">
              {failedFiles.length} file{failedFiles.length === 1 ? "" : "s"} failed. Retry keeps your selected files and uploaded results.
            </p>
          ) : null}
        </div>
      </form>

      {uploadedAssets.length > 0 ? (
        <div className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-200">
          <p>
            <span className="font-semibold">Uploaded:</span> {uploadedAssets.length} file
            {uploadedAssets.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 max-h-36 space-y-1 overflow-auto">
            {uploadedAssets.map((asset) => (
              <li key={asset.storageKey}>
                {asset.fileName} {"->"} {asset.storageProvider}/{asset.bucket}/
                {asset.storageKey}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? <p className="mt-3 text-sm text-green-700">{notice}</p> : null}
      {saveNotice ? <p className="mt-2 text-sm text-green-700">{saveNotice}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {validationIssues.length > 0 ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-3 text-xs ${
            UPLOAD_QUALITY_VALIDATION_MODE === "ENFORCE"
              ? "border-red-500/50 bg-red-500/10 text-red-200"
              : "border-amber-500/50 bg-amber-500/10 text-amber-200"
          }`}
        >
          <p className="font-semibold">
            {UPLOAD_QUALITY_VALIDATION_MODE === "ENFORCE"
              ? "Validation issues:"
              : "Quality warnings:"}
          </p>
          <ul className="mt-2 space-y-1">
            {validationIssues.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
