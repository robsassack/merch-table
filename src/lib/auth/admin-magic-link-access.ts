export const ADMIN_MAGIC_LINK_ACCESS_ERROR =
  "This magic link is not associated with an admin user.";

export async function enforceAdminMagicLinkAccess(input: {
  hasAdminAccess: boolean;
  issuedSessionToken: string;
  revokeIssuedSessionToken: (token: string) => Promise<void>;
}) {
  if (input.hasAdminAccess) {
    return { ok: true as const };
  }

  await input.revokeIssuedSessionToken(input.issuedSessionToken);
  return {
    ok: false as const,
    status: 403,
    error: ADMIN_MAGIC_LINK_ACCESS_ERROR,
  };
}
