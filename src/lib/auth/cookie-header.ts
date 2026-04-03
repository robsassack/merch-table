export function normalizeCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return cookieHeader;
  }

  const entries = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length < 2) {
    return cookieHeader;
  }

  // Keep the most recent instance of each cookie name.
  const dedupedFromRight: string[] = [];
  const seen = new Set<string>();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const equalsIndex = entry.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const name = entry.slice(0, equalsIndex).trim();
    if (seen.has(name)) {
      continue;
    }

    seen.add(name);
    dedupedFromRight.push(entry);
  }

  dedupedFromRight.reverse();
  return dedupedFromRight.join("; ");
}

export function withNormalizedCookieHeader(headers: Headers) {
  const cookieHeader = headers.get("cookie");
  const normalized = normalizeCookieHeader(cookieHeader);

  if (!cookieHeader || !normalized || cookieHeader === normalized) {
    return headers;
  }

  const next = new Headers(headers);
  next.set("cookie", normalized);
  return next;
}
