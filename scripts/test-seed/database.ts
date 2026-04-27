import { prisma } from "@/lib/prisma";

export function assertTestEnvironment() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes("merchtable_test")) {
    throw new Error(
      "Refusing to seed test data: DATABASE_URL must point at merchtable_test.",
    );
  }

  if (process.env.EMAIL_PROVIDER !== "mock") {
    throw new Error("Refusing to seed test data: EMAIL_PROVIDER must be mock.");
  }
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TranscodeOutput",
      "TranscodeJob",
      "DownloadEntitlement",
      "OrderItem",
      "Order",
      "BuyerLibraryToken",
      "ReleaseFile",
      "TrackAsset",
      "ReleaseTrack",
      "Release",
      "StoreSettings",
      "Customer",
      "Artist",
      "Membership",
      "StorageMigrationRun",
      "Organization",
      "Session",
      "Account",
      "Verification",
      "SetupWizardState",
      "SetupToken",
      "User"
    RESTART IDENTITY CASCADE
  `);
}
