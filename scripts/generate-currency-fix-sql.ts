import { prisma } from "@/lib/prisma";
import { getCurrencyMinorUnit } from "@/lib/money";

function shouldDownscaleByHundred(value: number, currency: string) {
  return getCurrencyMinorUnit(currency) === 0 && Number.isInteger(value) && value > 0 && value % 100 === 0;
}

async function main() {
  const releases = await prisma.release.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      currency: true,
      priceCents: true,
      fixedPriceCents: true,
      minimumPriceCents: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const statements: string[] = [];
  for (const release of releases) {
    const nextPrice = shouldDownscaleByHundred(release.priceCents, release.currency)
      ? Math.round(release.priceCents / 100)
      : release.priceCents;
    const nextFixed = release.fixedPriceCents !== null &&
      shouldDownscaleByHundred(release.fixedPriceCents, release.currency)
      ? Math.round(release.fixedPriceCents / 100)
      : release.fixedPriceCents;
    const nextMinimum = release.minimumPriceCents !== null &&
      shouldDownscaleByHundred(release.minimumPriceCents, release.currency)
      ? Math.round(release.minimumPriceCents / 100)
      : release.minimumPriceCents;

    if (
      nextPrice !== release.priceCents ||
      nextFixed !== release.fixedPriceCents ||
      nextMinimum !== release.minimumPriceCents
    ) {
      const fixedValue = nextFixed === null ? "NULL" : String(nextFixed);
      const minimumValue = nextMinimum === null ? "NULL" : String(nextMinimum);
      statements.push(
        `UPDATE "Release" SET "priceCents"=${nextPrice}, "fixedPriceCents"=${fixedValue}, "minimumPriceCents"=${minimumValue} WHERE "id"='${release.id}';`,
      );
    }
  }

  console.log("-- Review before applying.");
  console.log("BEGIN;");
  if (statements.length === 0) {
    console.log("-- No candidate rows found.");
  } else {
    for (const statement of statements) {
      console.log(statement);
    }
  }
  console.log("COMMIT;");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

