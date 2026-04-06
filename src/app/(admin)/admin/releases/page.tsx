import type { Metadata } from "next";

import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Releases",
};

export default async function AdminReleasesPage() {
  return <AdminShell activeTab="releases" />;
}
