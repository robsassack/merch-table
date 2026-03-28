import { NextResponse } from "next/server";

import {
  createSetupSessionCookieValue,
  getSetupSessionCookieName,
  getSetupSessionTtlSeconds,
} from "@/lib/auth/setup-session";
import { claimBootstrapSetupToken } from "@/lib/bootstrap/setup-token";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing setup token." },
      { status: 400 },
    );
  }

  const claimed = await claimBootstrapSetupToken(token);

  if (!claimed) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired setup token." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getSetupSessionCookieName(),
    value: createSetupSessionCookieValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/setup",
    maxAge: getSetupSessionTtlSeconds(),
  });

  return response;
}
