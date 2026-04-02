import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";

import { errorResponse, handleReleasePatchAction } from "./release-route-actions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ releaseId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const { releaseId } = await context.params;
  if (!releaseId) {
    return errorResponse("Release id is required.", 400);
  }

  return handleReleasePatchAction({
    request,
    releaseId,
    organizationId: auth.context.organizationId,
  });
}
