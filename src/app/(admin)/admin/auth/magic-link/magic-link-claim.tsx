"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ConsumeResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

function readTokenFromLocation() {
  const current = new URL(window.location.href);
  const hash = current.hash.startsWith("#")
    ? current.hash.slice(1)
    : current.hash;
  const fragmentParams = new URLSearchParams(hash);
  const fragmentToken = fragmentParams.get("token")?.trim() ?? "";
  if (fragmentToken) {
    return fragmentToken;
  }

  const queryToken = current.searchParams.get("token")?.trim() ?? "";
  return queryToken || null;
}

function clearTokenFromLocationBar() {
  const current = new URL(window.location.href);
  current.searchParams.delete("token");
  current.hash = "";

  const nextSearch = current.searchParams.toString();
  const nextPath =
    current.pathname + (nextSearch.length > 0 ? `?${nextSearch}` : "");

  window.history.replaceState(window.history.state, "", nextPath);
}

export function MagicLinkClaim() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = readTokenFromLocation();
    if (!token) {
      queueMicrotask(() => {
        setError("Missing token.");
      });
      return;
    }

    // Remove the token from the browser URL before any follow-up navigation.
    clearTokenFromLocationBar();

    const consume = async () => {
      const response = await fetch("/api/admin/auth/magic-link/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const body = (await response.json().catch(() => null)) as
        | ConsumeResponse
        | null;

      if (!response.ok || !body?.ok) {
        setError(body?.error ?? "This sign-in link is invalid or expired.");
        return;
      }

      router.replace(body.redirectTo ?? "/admin");
      router.refresh();
    };

    void consume();
  }, [router]);

  if (error) {
    return (
      <p className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error}
      </p>
    );
  }

  return <p className="text-sm text-zinc-600">Signing you in...</p>;
}
