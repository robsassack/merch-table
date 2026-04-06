"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { setupPrimaryButtonClassName } from "./button-styles";

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
    <form onSubmit={onSubmit} className="mt-4 flex w-full max-w-xl flex-col gap-3">
      <label htmlFor="setup-token" className="text-sm font-medium text-zinc-900">
        Paste setup token
      </label>
      <input
        id="setup-token"
        name="setup-token"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Enter one-time setup token"
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-zinc-500 focus:ring-2 focus:ring-emerald-200"
      />
      <button
        type="submit"
        className={`${setupPrimaryButtonClassName} w-fit`}
      >
        Unlock setup
      </button>
    </form>
  );
}
