export type StoreStatus = "SETUP" | "PRIVATE" | "PUBLIC";
export type ReleasePricingMode = "FREE" | "FIXED" | "PWYW";
export type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReleaseType =
  | "ALBUM"
  | "EP"
  | "SINGLE"
  | "COMPILATION"
  | "MIXTAPE"
  | "LIVE_ALBUM"
  | "SOUNDTRACK_SCORE"
  | "DEMO"
  | "BOOTLEG"
  | "REMIX"
  | "OTHER";
export type PreviewMode = "CLIP" | "FULL" | "NONE";

export type ReleaseDefaultArtist = {
  id: string;
  name: string;
};

export type StoreSettingsResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  message?: string;
  data?: {
    orgName: string;
    storeName: string;
    organizationLogoUrl: string | null;
    contactEmail: string;
    adminEmail: string;
    currency: string;
    storeStatus: StoreStatus;
    defaultReleaseArtistId: string | null;
    defaultReleasePricingMode: ReleasePricingMode | null;
    defaultReleaseStatus: ReleaseStatus | null;
    defaultReleaseType: ReleaseType | null;
    defaultReleasePwywMinimumCents: number | null;
    defaultReleaseAllowFreeCheckout: boolean | null;
    defaultPreviewMode: PreviewMode;
    defaultPreviewSeconds: number;
    releaseDefaultArtists: ReleaseDefaultArtist[];
  };
};

export type StoreSettingsPanelProps = {
  panelCardClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName: string;
};

export function resolveOrganizationLogoSrc(organizationLogoUrl: string) {
  return `/api/cover?url=${encodeURIComponent(organizationLogoUrl)}`;
}

export const releasePricingModeOptions: Array<{ value: ReleasePricingMode; label: string }> = [
  { value: "FREE", label: "Free" },
  { value: "FIXED", label: "Fixed" },
  { value: "PWYW", label: "Pay What You Want" },
];

export const releaseStatusOptions: Array<{ value: ReleaseStatus; label: string }> = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

export const releaseTypeOptions: Array<{ value: ReleaseType; label: string }> = [
  { value: "ALBUM", label: "Album" },
  { value: "EP", label: "EP" },
  { value: "SINGLE", label: "Single" },
  { value: "COMPILATION", label: "Compilation" },
  { value: "MIXTAPE", label: "Mixtape" },
  { value: "LIVE_ALBUM", label: "Live Album" },
  { value: "SOUNDTRACK_SCORE", label: "Soundtrack / Score" },
  { value: "DEMO", label: "Demo" },
  { value: "BOOTLEG", label: "Bootleg" },
  { value: "REMIX", label: "Remix" },
  { value: "OTHER", label: "Other" },
];

export function centsToCurrencyInput(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents < 0) {
    return "";
  }

  return (cents / 100).toFixed(2);
}

export function parseCurrencyInputToCents(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

export function refreshDocumentFavicon() {
  if (typeof document === "undefined") {
    return;
  }

  const nextHref = `/favicon.ico?v=${Date.now()}`;
  const rels = ["icon", "shortcut icon", "apple-touch-icon"] as const;

  for (const rel of rels) {
    let linkElement = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
    if (!linkElement) {
      linkElement = document.createElement("link");
      linkElement.rel = rel;
      document.head.appendChild(linkElement);
    }
    linkElement.href = nextHref;
  }
}
