export const SAFE_EXTERNAL_ERROR_MESSAGES = {
  smtpTest:
    "Could not send test email. Check host, port, SSL/TLS setting, username, and password.",
  storageValidation:
    "Could not validate storage settings. Check endpoint, region, bucket, and credentials.",
  stripeVerification:
    "Could not verify Stripe credentials. Check your API key, webhook secret, and network access.",
  adminMagicLink:
    "Could not send admin magic link. Check Email Config in Step 2 and try again.",
} as const;
