import { headers } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionWithStrictLookup } from "@/lib/auth/admin-session-lookup";
import { auth } from "@/lib/better-auth";

import { AdminAuthRequestForm } from "./request-form";

export const metadata: Metadata = {
  title: "Admin Sign In",
};

export default async function AdminAuthPage() {
  const session = await getSessionWithStrictLookup({
    headers: new Headers(await headers()),
    getSession: auth.api.getSession,
  });

  if (session) {
    redirect("/admin");
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="operator-theme min-h-screen w-full px-4 py-10 sm:px-6 sm:py-16"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col justify-center">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-6 shadow-[0_30px_80px_-38px_rgba(5,9,18,0.85)] backdrop-blur sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Admin Sign In
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Enter your admin email to receive a one-time sign-in link.
          </p>
          <AdminAuthRequestForm />
        </section>
      </div>
    </main>
  );
}
