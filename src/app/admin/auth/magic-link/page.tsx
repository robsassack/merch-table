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
    <main className="operator-theme min-h-screen w-full px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col justify-center">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-6 shadow-[0_30px_80px_-38px_rgba(5,9,18,0.85)] backdrop-blur sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Admin Magic Link
          </h1>
          <div className="mt-4">
            {token ? (
              <MagicLinkClaim token={token} />
            ) : (
              <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Missing token.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
