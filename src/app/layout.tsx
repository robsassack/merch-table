import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Mono } from "next/font/google";

import { prisma } from "@/lib/prisma";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  let faviconHref = "/favicon.ico";

  try {
    const settings = await prisma.storeSettings.findFirst({
      select: {
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const faviconVersion = settings?.updatedAt?.getTime();
    if (typeof faviconVersion === "number" && Number.isFinite(faviconVersion)) {
      faviconHref = `/favicon.ico?v=${faviconVersion}`;
    }
  } catch {
    // Keep default favicon path if settings cannot be loaded.
  }

  return {
    title: {
      default: "Merch Table",
      template: "%s | Merch Table",
    },
    description: "Merch Table",
    icons: {
      icon: faviconHref,
      shortcut: faviconHref,
      apple: faviconHref,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceMono.variable} antialiased`}
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
