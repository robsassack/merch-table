export const runtime = "nodejs";

declare global {
  var setupTokenBootstrapChecked: boolean | undefined;
}

const REQUIRED_ENV_VARS = ["DATABASE_URL", "AUTH_SECRET", "APP_ENCRYPTION_KEY"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Check your .env file or deployment configuration.",
    );
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  validateEnv();

  if (globalThis.setupTokenBootstrapChecked) {
    return;
  }

  globalThis.setupTokenBootstrapChecked = true;

  try {
    const { ensureBootstrapSetupTokenOnStartup } = await import(
      "@/lib/bootstrap/setup-token"
    );
    await ensureBootstrapSetupTokenOnStartup();
  } catch (error) {
    console.error("[bootstrap] Failed to provision setup token", error);
  }
}
