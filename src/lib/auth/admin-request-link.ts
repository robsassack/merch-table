export const GENERIC_ADMIN_MAGIC_LINK_MESSAGE =
  "If that email is authorized, a magic link has been sent.";

export function resolveAdminRequestLinkPlan(input: {
  emailRateLimited: boolean;
  authorized: boolean;
}) {
  if (input.emailRateLimited) {
    return {
      shouldSendMagicLink: false,
      message: GENERIC_ADMIN_MAGIC_LINK_MESSAGE,
    };
  }

  if (!input.authorized) {
    return {
      shouldSendMagicLink: false,
      message: GENERIC_ADMIN_MAGIC_LINK_MESSAGE,
    };
  }

  return {
    shouldSendMagicLink: true,
    message: GENERIC_ADMIN_MAGIC_LINK_MESSAGE,
  };
}
