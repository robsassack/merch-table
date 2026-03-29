"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { SUPPORTED_CURRENCIES } from "@/lib/setup/currencies";

import { setupContinueButtonClassName } from "./button-styles";

type StepOneFormProps = {
  initialValues: {
    orgName: string;
    storeName: string;
    contactEmail: string;
    currency: string;
  };
};

export function StepOneForm({ initialValues }: StepOneFormProps) {
  const router = useRouter();
  const initialCurrency = SUPPORTED_CURRENCIES.some(
    (supportedCurrency) => supportedCurrency.code === initialValues.currency,
  )
    ? initialValues.currency
    : "USD";

  const [orgName, setOrgName] = useState(initialValues.orgName);
  const [storeName, setStoreName] = useState(initialValues.storeName);
  const [contactEmail, setContactEmail] = useState(initialValues.contactEmail);
  const [currency, setCurrency] = useState(initialCurrency);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/setup/step-1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        orgName,
        storeName,
        contactEmail,
        currency: currency.toUpperCase(),
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Could not save setup basics.");
      setIsSaving(false);
      return;
    }

    setSaved(true);
    setIsSaving(false);
    router.push("/setup?step=2");
  };

  return (
    <form onSubmit={onSubmit} className="step-enter mt-5 flex w-full max-w-xl flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Step 1: Store Basics</h2>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Organization name
        <input
          required
          minLength={2}
          maxLength={120}
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Store name
        <input
          required
          minLength={2}
          maxLength={120}
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Contact email
        <input
          required
          type="email"
          maxLength={320}
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Currency
        <select
          required
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        >
          {SUPPORTED_CURRENCIES.map((supportedCurrency) => (
            <option key={supportedCurrency.code} value={supportedCurrency.code}>
              {supportedCurrency.flag} {supportedCurrency.code} ({supportedCurrency.symbol}) -{" "}
              {supportedCurrency.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-1 flex w-fit">
        <button
          type="submit"
          disabled={isSaving}
          className={setupContinueButtonClassName}
        >
          {isSaving ? "Saving..." : "Save & Continue →"}
        </button>
      </div>

      {saved ? (
        <p className="text-sm text-green-700">Step 1 saved.</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
