import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";

import {
  getAdminMagicLinkExpiryMinutes,
  sendAdminMagicLinkEmail,
} from "@/lib/auth/admin-magic-link";
import { prisma } from "@/lib/prisma";

const adminMagicLinkExpiresInSeconds = getAdminMagicLinkExpiryMinutes() * 60;

export const auth = betterAuth({
  baseURL: process.env.APP_BASE_URL,
  secret: process.env.AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    modelName: "User",
  },
  session: {
    modelName: "Session",
  },
  account: {
    modelName: "Account",
  },
  verification: {
    modelName: "Verification",
  },
  plugins: [
    magicLink({
      expiresIn: adminMagicLinkExpiresInSeconds,
      allowedAttempts: 1,
      storeToken: "hashed",
      disableSignUp: false,
      async sendMagicLink({ email, token }) {
        await sendAdminMagicLinkEmail({ email, token });
      },
    }),
  ],
});
