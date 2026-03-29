import { StoreStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import { AdminWorkspace } from "./admin-workspace";

export default async function AdminPage() {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      storeStatus: true,
      storeName: true,
      brandName: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const storeStatus = settings?.storeStatus ?? StoreStatus.SETUP;
  const storeName = settings?.storeName ?? settings?.brandName ?? null;

  return (
    <main className="operator-theme min-h-screen w-full px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col justify-center">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-6 shadow-[0_30px_80px_-38px_rgba(5,9,18,0.85)] backdrop-blur sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">Admin</h1>
          <AdminWorkspace storeStatus={storeStatus} storeName={storeName} />
        </section>
      </div>
    </main>
  );
}
