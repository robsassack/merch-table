"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MagicLinkClaimProps = {
  token: string;
};

type ConsumeResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

export function MagicLinkClaim({ token }: MagicLinkClaimProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [router, token]);

  if (error) {
    return (
      <p className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error}
      </p>
    );
  }

  return <p className="text-sm text-zinc-600">Signing you in...</p>;
}
