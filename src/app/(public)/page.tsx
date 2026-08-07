import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  FileText,
  Landmark,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { en } from "@/i18n/en";
import { cn } from "@/lib/utils";

const iconCycle = [Banknote, BadgeCheck, FileText, Landmark, LineChart, ShieldCheck];

export default function LandingPage() {
  const t = en.landing;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
          <Link href="/" aria-label="PayFlow home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-body md:flex">
            <a href="#features" className="transition-colors hover:text-ink">
              {t.nav.features}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
              {t.nav.signIn}
            </Link>
            <Link href="/register" className={cn(buttonVariants({ variant: "primary" }))}>
              {t.hero.ctaPrimary}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(640px 320px at 15% -5%, rgba(79,70,229,.12), transparent 60%), radial-gradient(640px 320px at 92% 105%, rgba(13,148,136,.12), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
          <span className="inline-flex h-7 items-center rounded-full bg-indigo-50 px-3 text-xs font-semibold text-primary-700">
            {t.hero.badge}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-[44px] leading-[1.06] font-extrabold tracking-tight text-ink sm:text-[56px]">
            {t.hero.title}{" "}
            <span className="brand-gradient bg-clip-text text-transparent">{t.hero.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-body">
            {t.hero.subtitle}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3.5">
            <Link href="/register" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>
              {t.hero.ctaPrimary} <ArrowRight />
            </Link>
            <a href="#features" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
              {t.hero.ctaSecondary}
            </a>
          </div>
          <p className="mt-4 text-xs text-muted">{t.hero.note}</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/70 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <h2 className="text-[28px] font-bold tracking-tight text-ink">{t.features.heading}</h2>
            <p className="mt-2 text-[15px] text-muted">{t.features.sub}</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((feature, i) => {
              const Icon = iconCycle[i % iconCycle.length] ?? Banknote;
              return (
                <div
                  key={feature.title}
                  className="rounded-card border border-border bg-canvas p-6 transition-shadow hover:shadow-card"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50">
                    <Icon className="h-5 w-5 text-primary-600" strokeWidth={1.9} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-body">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70 bg-canvas py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted sm:flex-row">
          <Logo />
          <p>
            © {new Date().getFullYear()} {t.footer.copyright}
          </p>
        </div>
      </footer>
    </div>
  );
}
