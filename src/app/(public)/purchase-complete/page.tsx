import Link from "next/link";
import type { Metadata } from "next";
import Stripe from "stripe";

import { buyerTheme } from "@/app/(public)/buyer-theme";
import StorefrontHeader from "@/app/(public)/storefront-header";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontBrandLabel } from "@/lib/storefront-brand";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      storeName: true,
      brandName: true,
      organization: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const brandLabel = resolveStorefrontBrandLabel({
    storeName: settings?.storeName ?? null,
    brandName: settings?.brandName ?? null,
    organizationName: settings?.organization?.name ?? null,
  });

  return {
    title: {
      absolute: `Purchase Complete | ${brandLabel}`,
    },
  };
}

type PurchaseCompletePageProps = {
  searchParams: Promise<{ session_id?: string | string[] }>;
};

async function readStripeSecretKey() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { stripeSecretKey: true },
  });

  return (
    decryptSecret(state?.stripeSecretKey) ??
    process.env.STRIPE_SECRET_KEY?.trim() ??
    null
  );
}

export default async function PurchaseCompletePage({
  searchParams,
}: PurchaseCompletePageProps) {
  const resolvedSearchParams = await searchParams;
  const rawSessionId = resolvedSearchParams.session_id;
  const sessionId = Array.isArray(rawSessionId)
    ? rawSessionId[0]?.trim()
    : rawSessionId?.trim();

  const order =
    sessionId && sessionId.length > 0
      ? await prisma.order.findUnique({
          where: {
            checkoutSessionId: sessionId,
          },
          select: {
            items: {
              orderBy: {
                lineNumber: "asc",
              },
              take: 1,
              select: {
                release: {
                  select: {
                    title: true,
                    artist: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : null;

  let artistName = order?.items[0]?.release.artist.name ?? null;
  let releaseTitle = order?.items[0]?.release.title ?? null;

  if (sessionId && (!artistName || !releaseTitle)) {
    try {
      const stripeSecretKey = await readStripeSecretKey();
      if (stripeSecretKey) {
        const stripe = new Stripe(stripeSecretKey);
        const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
        const releaseId = checkoutSession.metadata?.releaseId?.trim();
        const organizationId = checkoutSession.metadata?.organizationId?.trim();

        if (releaseId && organizationId) {
          const release = await prisma.release.findFirst({
            where: {
              id: releaseId,
              organizationId,
              deletedAt: null,
            },
            select: {
              title: true,
              artist: {
                select: {
                  name: true,
                },
              },
            },
          });

          if (release) {
            releaseTitle = release.title;
            artistName = release.artist.name;
          }
        }
      }
    } catch {
      // Keep fallback messaging when Stripe/session lookup is unavailable.
    }
  }

  const hasVerifiedPurchase = Boolean(artistName);

  const heading = hasVerifiedPurchase
    ? `Thank You for Supporting ${artistName}`
    : "Thank You for Supporting Independent Artists";

  const body = hasVerifiedPurchase
    ? "Your payment was successful. Check your email for your library link and download instructions."
    : sessionId
      ? "We are still confirming your purchase details. If checkout just finished, give it a moment and check your email shortly."
      : "This page appears to have been opened directly. Once checkout is complete, your confirmation message will appear here.";

  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto mb-12 flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
      >
        <section className={`${buyerTheme.panel} w-full max-w-3xl self-center text-center`}>
          <p className={buyerTheme.eyebrow}>Purchase Complete</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-3 text-sm text-zinc-700">
            {body}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            If you do not see the email within a minute or two, check spam or use Find My
            Purchases to request a fresh link.
          </p>
          {releaseTitle ? (
            <p className="mt-2 text-xs text-zinc-500">
              Release: <span className="font-medium text-zinc-700">{releaseTitle}</span>
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/find-my-purchases" className={buyerTheme.buttonPrimary}>
              Find My Purchases
            </Link>
            <Link
              href="/"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-zinc-300 px-5 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
            >
              Back To Store
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
