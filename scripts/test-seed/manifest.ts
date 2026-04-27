import { prisma } from "@/lib/prisma";

import {
  ENTITLEMENT_TOKENS,
  LIBRARY_TOKENS,
  releaseFixtures,
} from "./fixtures";

export async function printManifest() {
  const [releaseCount, trackCount, orderCount, libraryTokenCount] =
    await Promise.all([
      prisma.release.count(),
      prisma.releaseTrack.count(),
      prisma.order.count(),
      prisma.buyerLibraryToken.count(),
    ]);

  console.log("Seeded deterministic test data:");
  console.log(`- Releases: ${releaseCount}`);
  console.log(`- Tracks: ${trackCount}`);
  console.log(`- Orders: ${orderCount}`);
  console.log(`- Library tokens: ${libraryTokenCount}`);
  console.log("- Storefront release slugs:");
  for (const fixture of releaseFixtures) {
    console.log(`  - ${fixture.key}: /release/${fixture.slug}`);
  }
  console.log("- Buyer library tokens:");
  console.log(`  - valid: ${LIBRARY_TOKENS.valid}`);
  console.log(`  - revoked: ${LIBRARY_TOKENS.revoked}`);
  console.log(`  - expired: ${LIBRARY_TOKENS.expired}`);
  console.log("- Entitlement tokens:");
  console.log(`  - fixed flac: ${ENTITLEMENT_TOKENS.fixedFlac}`);
  console.log(`  - expired fixed flac: ${ENTITLEMENT_TOKENS.expiredFixedFlac}`);
}
