import { redirect } from "next/navigation";

import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { consumeAdminMagicLinkToken } from "@/lib/setup/step-five";
import { completeSetup } from "@/lib/setup/step-six";

type AdminMagicLinkPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function AdminMagicLinkPage({
  searchParams,
}: AdminMagicLinkPageProps) {
  const params = await searchParams;
  const token =
    typeof params.token === "string" ? params.token : params.token?.[0];

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Magic Link</h1>
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Missing token.
        </p>
      </main>
    );
  }

  const consumed = await consumeAdminMagicLinkToken(token);
  if (!consumed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Magic Link</h1>
        <p className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          This admin sign-in link is invalid, expired, or already used.
        </p>
      </main>
    );
  }

  const stepOneState = await getStepOneState();
  if (!isStepOneComplete(stepOneState)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Magic Link</h1>
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Setup basics are incomplete. Return to setup and finish Step 1 first.
        </p>
      </main>
    );
  }

  try {
    await completeSetup({
      orgName: stepOneState.orgName,
      storeName: stepOneState.storeName,
      contactEmail: stepOneState.contactEmail,
      currency: stepOneState.currency,
      adminEmail: consumed.email,
    });
  } catch {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Magic Link</h1>
        <p className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          Could not complete setup from this link. Please retry from setup.
        </p>
      </main>
    );
  }

  redirect("/admin");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Magic Link</h1>
      <p className="rounded border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
        Redirecting to admin...
      </p>
    </main>
  );
}
