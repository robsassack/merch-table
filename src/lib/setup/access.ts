import { cookies } from "next/headers";

import { hasValidSetupSession } from "@/lib/auth/setup-session";

export async function hasSetupAccess() {
  const cookieStore = await cookies();
  return hasValidSetupSession(cookieStore);
}
