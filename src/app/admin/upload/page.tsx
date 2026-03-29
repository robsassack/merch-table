import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminUploadPage() {
  return <AdminShell activeTab="upload" />;
}
