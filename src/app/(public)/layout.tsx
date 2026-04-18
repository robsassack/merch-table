import StorefrontAudioShell from "@/app/(public)/storefront-audio-shell";
import { isDemoModeEnabled } from "@/lib/env/demo-mode";

type PublicLayoutProps = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: PublicLayoutProps) {
  const demoModeEnabled = isDemoModeEnabled();

  return (
    <StorefrontAudioShell>
      {demoModeEnabled ? (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950">
          Demo mode is enabled. Checkout uses Stripe test mode.
        </div>
      ) : null}
      {children}
    </StorefrontAudioShell>
  );
}
