import { buildLibraryMagicLinkUrl } from "@/lib/checkout/buyer-library-link";
import { prisma } from "@/lib/prisma";

type ScriptOptions = {
  releaseId: string;
  email: string;
  baseUrl: string;
};

function readOption(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function parseOptions(): ScriptOptions {
  const releaseId =
    readOption("--release-id") ?? "cmnktn5z6000095ijgm57c1fc";
  const email = readOption("--email") ?? "rsassack25@gmail.com";
  const baseUrl = readOption("--base-url") ?? "http://localhost:3000";

  return {
    releaseId: releaseId.trim(),
    email: email.trim().toLowerCase(),
    baseUrl: baseUrl.trim(),
  };
}

async function run() {
  const options = parseOptions();

  const response = await fetch(`${options.baseUrl}/api/checkout/free`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      releaseId: options.releaseId,
      email: options.email,
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: response.status,
          releaseId: options.releaseId,
          email: options.email,
          payload,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const settings = await prisma.storeSettings.findFirst({
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });

  const customer = settings
    ? await prisma.customer.findUnique({
        where: {
          organizationId_email: {
            organizationId: settings.organizationId,
            email: options.email,
          },
        },
        select: { id: true },
      })
    : null;

  const latestLibraryToken = customer
    ? await prisma.buyerLibraryToken.findFirst({
        where: { customerId: customer.id, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          token: true,
          createdAt: true,
          expiresAt: true,
        },
      })
    : null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: response.status,
        releaseId: options.releaseId,
        email: options.email,
        payload,
        libraryMagicLinkUrl: latestLibraryToken
          ? buildLibraryMagicLinkUrl(latestLibraryToken.token)
          : null,
        libraryTokenCreatedAt: latestLibraryToken?.createdAt ?? null,
        libraryTokenExpiresAt: latestLibraryToken?.expiresAt ?? null,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("fetch failed")
    ) {
      console.error(
        "Could not reach the app API. Start the app (for example `npm run dev`) and retry.",
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
