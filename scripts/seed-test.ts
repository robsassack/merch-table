import { prisma } from "@/lib/prisma";

import { assertTestEnvironment, resetDatabase } from "./test-seed/database";
import { seedCustomersOrdersAndTokens } from "./test-seed/commerce";
import { printManifest } from "./test-seed/manifest";
import { seedReleases } from "./test-seed/releases";
import { seedStoreBaseline } from "./test-seed/store";
import { seedTranscodeFixtures } from "./test-seed/transcode";

async function main() {
  assertTestEnvironment();
  await resetDatabase();
  await seedStoreBaseline();
  await seedReleases();
  await seedCustomersOrdersAndTokens();
  await seedTranscodeFixtures();
  await printManifest();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
