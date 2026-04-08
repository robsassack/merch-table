import type { Metadata } from "next";

import { AdminShell } from "../admin-shell";
import type { OrderManagementSearchParams } from "../order-management-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Orders",
};

type AdminOrdersPageProps = {
  searchParams: Promise<OrderManagementSearchParams>;
};

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const resolvedSearchParams = await searchParams;
  return <AdminShell activeTab="orders" ordersSearchParams={resolvedSearchParams} />;
}
