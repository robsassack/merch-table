export const buyerTheme = {
  page:
    "min-h-screen w-full bg-[radial-gradient(circle_at_12%_12%,#ddf5ea_0%,transparent_38%),radial-gradient(circle_at_88%_0%,#e2ecff_0%,transparent_32%),linear-gradient(180deg,#f8fbfa_0%,#f4f7fb_100%)] text-zinc-900",
  header: "border-b border-zinc-200/70",
  headerInner:
    "mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6",
  brandBadge:
    "inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white",
  nav: "flex items-center gap-4 text-sm text-zinc-500",
  navLink: "text-zinc-700 hover:text-zinc-900",
  panel:
    "rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)] sm:p-5",
  eyebrow:
    "text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700",
  subtitle: "mt-2 text-sm text-zinc-600",
  input:
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-emerald-500",
  buttonPrimary:
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:text-emerald-900",
  statusNeutral:
    "rounded-xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-600",
  statusSuccess:
    "rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900",
  statusError:
    "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900",
};

export function resolveBrandGlyph(brandLabel: string) {
  const first = brandLabel.trim().charAt(0);
  if (!first) {
    return "s";
  }
  return first.toLowerCase();
}
