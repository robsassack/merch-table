const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSY_VALUES = new Set(["0", "false", "no", "off"]);

export function isDemoModeEnabled() {
  const raw = process.env.DEMO_MODE?.trim().toLowerCase();
  if (!raw) {
    return false;
  }

  if (TRUTHY_VALUES.has(raw)) {
    return true;
  }

  if (FALSY_VALUES.has(raw)) {
    return false;
  }

  return false;
}
