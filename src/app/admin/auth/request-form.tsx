"use client";

import { FormEvent, useState } from "react";

type RequestLinkResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export function AdminAuthRequestForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = (await response.json().catch(() => null)) as
        | RequestLinkResponse
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Could not send magic link.");
      }

      setNotice(
        body.message ??
          "If that email is authorized, a magic link has been sent.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send magic link.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Admin email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
          placeholder="you@example.com"
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-fit items-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send Sign-In Link"}
      </button>

      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
