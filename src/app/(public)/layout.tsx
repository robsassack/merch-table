import StorefrontAudioShell from "@/app/(public)/storefront-audio-shell";

type PublicLayoutProps = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: PublicLayoutProps) {
  return <StorefrontAudioShell>{children}</StorefrontAudioShell>;
}
