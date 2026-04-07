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
    <form onSubmit={onSubmit} className="mt-5 flex w-full max-w-xl flex-col gap-4">
      <label htmlFor="admin-auth-email" className="flex flex-col gap-1 text-sm text-zinc-700">
        Admin email
        <input
          id="admin-auth-email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-emerald-200"
          placeholder="you@example.com"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "admin-auth-error" : undefined}
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-fit items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send Sign-In Link"}
      </button>

      {notice ? (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p id="admin-auth-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
