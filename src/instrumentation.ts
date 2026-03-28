export const runtime = "nodejs";

declare global {
  var setupTokenBootstrapChecked: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

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
