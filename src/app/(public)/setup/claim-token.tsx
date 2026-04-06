"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClaimTokenProps = {
  token: string;
};

export function ClaimToken({ token }: ClaimTokenProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const claim = async () => {
      const response = await fetch("/api/setup/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        setError("That setup token is invalid, expired, or already used.");
        return;
      }

      router.replace("/setup");
      router.refresh();
    };

    void claim();
  }, [router, token]);

  if (error) {
    return (
      <p className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error}
      </p>
    );
  }

  return <p className="text-sm text-zinc-600">Claiming setup token...</p>;
}
