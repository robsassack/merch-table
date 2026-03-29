import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasValidAdminSession } from "@/lib/auth/admin-session";

import { AdminAuthRequestForm } from "./request-form";

export default async function AdminAuthPage() {
  const cookieStore = await cookies();
  if (hasValidAdminSession(cookieStore)) {
    redirect("/admin");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Sign In</h1>
      <p className="text-sm text-zinc-600">
        Enter your admin email to receive a one-time sign-in link.
      </p>
      <AdminAuthRequestForm />
    </main>
  );
}
