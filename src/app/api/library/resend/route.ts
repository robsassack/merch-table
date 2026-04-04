import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildLibraryMagicLinkUrl,
  createBuyerLibraryTokenExpiresAt,
} from "@/lib/checkout/buyer-library-link";
import { sendFreeLibraryLinkEmail } from "@/lib/checkout/free-library-link-email";
import { prisma } from "@/lib/prisma";
import { libraryRateLimitPolicies } from "@/lib/security/library-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import {
  createHashedRateLimitKey,
  enforceRateLimit,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const resendSchema = z.object({
  email: z.string().trim().min(1).max(320).email(),
});

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function genericSuccessResponse() {
  return NextResponse.json(
    {
      ok: true,
      message:
        "If that email has purchases, a fresh library link has been sent.",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

function readRetryAfterSeconds(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return null;
  }
  const parsed = Number.parseInt(retryAfter, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    console.warn("[library.resend] CSRF validation failed.");
    return csrfError;
  }

  const ipRateLimitError = await enforceRateLimit(
    request,
    libraryRateLimitPolicies.resendByIp,
  );
  if (ipRateLimitError) {
    console.warn("[library.resend] Rate limit hit (ip).", {
      retryAfterSeconds: readRetryAfterSeconds(ipRateLimitError),
    });
    return ipRateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = resendSchema.parse(payload);
    const normalizedEmail = parsed.email.trim().toLowerCase();

    const emailRateLimitError = await enforceRateLimit(
      request,
      libraryRateLimitPolicies.resendByEmail,
      {
        key: `library-resend-email:${createHashedRateLimitKey(normalizedEmail)}`,
      },
    );
    if (emailRateLimitError) {
      console.warn("[library.resend] Rate limit hit (email).", {
        emailHash: createHashedRateLimitKey(normalizedEmail).slice(0, 12),
        retryAfterSeconds: readRetryAfterSeconds(emailRateLimitError),
      });
      return emailRateLimitError;
    }

    const settings = await prisma.storeSettings.findFirst({
      select: {
        setupComplete: true,
        organizationId: true,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!settings?.setupComplete) {
      return genericSuccessResponse();
    }

    const customer = await prisma.customer.findUnique({
      where: {
        organizationId_email: {
          organizationId: settings.organizationId,
          email: normalizedEmail,
        },
      },
      select: {
        id: true,
      },
    });
    if (!customer) {
      return genericSuccessResponse();
    }

    const latestEntitlement = await prisma.downloadEntitlement.findFirst({
      where: {
        customerId: customer.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        release: {
          select: {
            title: true,
          },
        },
      },
    });
    if (!latestEntitlement) {
      return genericSuccessResponse();
    }

    const now = new Date();
    const expiresAt = createBuyerLibraryTokenExpiresAt(now);
    const libraryToken = await prisma.buyerLibraryToken.create({
      data: {
        organizationId: settings.organizationId,
        customerId: customer.id,
        token: createToken(),
        expiresAt,
      },
      select: { token: true },
    });

    try {
      await sendFreeLibraryLinkEmail({
        email: normalizedEmail,
        releaseTitle: latestEntitlement.release.title,
        libraryMagicLinkUrl: buildLibraryMagicLinkUrl(libraryToken.token),
      });
    } catch (error) {
      // Keep response generic and non-enumerating even if email delivery fails.
      console.warn("[library.resend] Email send failed.", {
        emailHash: createHashedRateLimitKey(normalizedEmail).slice(0, 12),
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }

    return genericSuccessResponse();
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn("[library.resend] Invalid request payload.");
      return NextResponse.json(
        { ok: false, error: "Invalid library resend payload." },
        { status: 400 },
      );
    }

    console.error("[library.resend] Unexpected error.", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return genericSuccessResponse();
  }
}
