import { NextResponse } from "next/server";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { SAFE_EXTERNAL_ERROR_MESSAGES } from "@/lib/security/safe-errors";
import {
  markStorageValidationFailed,
  validateExternalS3Credentials,
} from "@/lib/setup/step-three";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await validateExternalS3Credentials();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    const message = SAFE_EXTERNAL_ERROR_MESSAGES.storageValidation;
    await markStorageValidationFailed(message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
