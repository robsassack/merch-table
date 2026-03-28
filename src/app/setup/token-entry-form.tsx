"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function TokenEntryForm() {
  const router = useRouter();
  const [token, setToken] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = token.trim();
    if (!trimmed) {
      return;
    }

    router.push(`/setup?token=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-lg flex-col gap-3">
      <label htmlFor="setup-token" className="text-sm font-medium text-zinc-900">
        Paste setup token
      </label>
      <input
        id="setup-token"
        name="setup-token"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Enter one-time setup token"
        className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-zinc-500"
      />
      <button
        type="submit"
        className="inline-flex w-fit items-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Unlock setup
      </button>
    </form>
  );
}
