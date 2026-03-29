import { AssetUploadPanel } from "./asset-upload-panel";

export default function AdminPage() {
  return (
    <main className="operator-theme min-h-screen w-full px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col justify-center">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-6 shadow-[0_30px_80px_-38px_rgba(5,9,18,0.85)] backdrop-blur sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">Admin</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Setup is complete and the store is currently private.
          </p>

          <AssetUploadPanel />
        </section>
      </div>
    </main>
  );
}
