export type StripeSettingsState = {
  hasSecretKey: boolean;
  stripeWebhookSecret: string;
  webhookUrl: string;
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
};

export type StripeSettingsResponse = {
  ok?: boolean;
  error?: string;
  data?: StripeSettingsState;
  verifiedAt?: string;
  message?: string;
};

export type SmtpSettingsState = {
  smtpProviderPreset: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpSecure: boolean;
  smtpFromEmail: string;
  smtpTestRecipient: string;
  hasPassword: boolean;
  testPassed: boolean;
  lastTestedAt: string | null;
  lastTestError: string | null;
};

export type SmtpSettingsResponse = {
  ok?: boolean;
  error?: string;
  data?: SmtpSettingsState;
  sentAt?: string;
  recipient?: string;
};

export type TranscodeStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: {
    queueDepth: number | null;
    queuedJobs: number;
    runningJobs: number;
    workerUp: boolean;
    lastWorkerHeartbeatAt: string | null;
    workerStaleAfterSeconds: number;
    lastSuccessfulJobAt: string | null;
    checkedAt: string;
    serviceConnectivity: {
      database: {
        reachable: boolean;
        error: string | null;
      };
      redis: {
        reachable: boolean;
        error: string | null;
      };
      storage: {
        reachable: boolean;
        error: string | null;
        provider: "GARAGE" | "S3" | null;
        bucket: string | null;
      };
    };
    emailAndStorageMetrics: {
      recentFailedEmailCount: number;
      recentFailedEmailWindowDays: number;
      recentFailedEmailsSince: string;
      totalTrackAssetSizeBytes: number;
    };
    warnings: string[];
  };
};

export type TranscodeStatusPayload = NonNullable<TranscodeStatusResponse["status"]>;

export type SharedPanelProps = {
  panelCardClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
};

export function formatBytes(sizeBytes: number | null | undefined) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimalPlaces = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimalPlaces)} ${units[unitIndex]}`;
}
