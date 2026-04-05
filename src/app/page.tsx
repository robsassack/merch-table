import type { Metadata } from "next";

import HomePageClient from "./home-page-client";

export const metadata: Metadata = {
  title: "Storefront",
};

export default function Home() {
  return <HomePageClient />;
}
