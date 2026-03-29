import { MagicLinkClaim } from "./magic-link-claim";

type AdminMagicLinkPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function AdminMagicLinkPage({
  searchParams,
}: AdminMagicLinkPageProps) {
  const params = await searchParams;
  const token =
    typeof params.token === "string" ? params.token : params.token?.[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Magic Link</h1>
      {token ? (
        <MagicLinkClaim token={token} />
      ) : (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Missing token.
        </p>
      )}
    </main>
  );
}
