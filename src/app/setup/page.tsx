import { cookies } from "next/headers";

import { hasValidSetupSession } from "@/lib/auth/setup-session";

import { ClaimToken } from "./claim-token";
import { TokenEntryForm } from "./token-entry-form";

type SetupPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

function getTokenParam(token: string | string[] | undefined) {
  if (typeof token === "string") {
    return token;
  }

  return token?.[0];
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const params = await searchParams;
  const token = getTokenParam(params.token);
  const cookieStore = await cookies();
  const hasAccess = hasValidSetupSession(cookieStore);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Store Setup</h1>

      {token ? (
        <ClaimToken token={token} />
      ) : hasAccess ? (
        <p className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          Setup access granted. We can wire the wizard steps here next.
        </p>
      ) : (
        <>
          <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Setup is locked. Use the bootstrap token from server logs:
            <code className="ml-1">/setup?token=...</code>
          </p>
          <TokenEntryForm />
        </>
      )}
    </main>
  );
}
