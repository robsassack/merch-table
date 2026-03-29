export function formatIsoTimestampForDisplay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  // Stable UTC formatting avoids server/client locale and timezone mismatches.
  return parsed.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
