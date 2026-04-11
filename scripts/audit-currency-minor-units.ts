import { prisma } from "@/lib/prisma";
import { getCurrencyMinorUnit } from "@/lib/money";

type SuspiciousRelease = {
  id: string;
  title: string;
  currency: string;
  pricingMode: string;
  priceCents: number;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
};

function isLikelyLegacyScaledValue(value: number, currency: string) {
  if (!Number.isInteger(value) || value <= 0) {
    return false;
  }

  if (getCurrencyMinorUnit(currency) !== 0) {
    return false;
  }

  // Heuristic: zero-decimal currencies should rarely have values that are exactly
  // scaled by 100 across all fields after historical USD-centric conversions.
  return value % 100 === 0;
}

async function main() {
  const releases = await prisma.release.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      currency: true,
      pricingMode: true,
      priceCents: true,
      fixedPriceCents: true,
      minimumPriceCents: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const suspicious: SuspiciousRelease[] = releases.filter((release) => {
    const values = [
      release.priceCents,
      release.fixedPriceCents ?? 0,
      release.minimumPriceCents ?? 0,
    ];
    return values.some((value) => isLikelyLegacyScaledValue(value, release.currency));
  });

  console.log(
    JSON.stringify(
      {
        scanned: releases.length,
        suspiciousCount: suspicious.length,
        suspicious,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

