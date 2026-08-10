"use client";

/**
 * PayFlow landing — immersive dark hero with a 3D product scene, capability
 * marquee, light bento features, scroll-linked story, stats, and a grand CTA.
 */
import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/ui/logo";
import { Counter, Magnetic, Marquee, Reveal, EASE_OUT } from "./motion-kit";
import { HeroScene } from "./hero-scene";
import { SiteNav } from "./site-nav";
import { FeatureBento } from "./bento";
import { HowItWorks } from "./how-it-works";
import { en } from "@/i18n/en";

function Hero() {
  const t = en.landing.hero;
  const reduce = useReducedMotion();

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 34, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 1, delay, ease: EASE_OUT },
        };

  return (
    <section className="relative overflow-hidden">
      {/* ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-aurora-a absolute -top-40 left-[-10%] h-[34rem] w-[42rem] rounded-full bg-indigo-600/25 blur-[130px]" />
        <div className="animate-aurora-b absolute top-[-8rem] right-[-12%] h-[30rem] w-[38rem] rounded-full bg-teal-500/18 blur-[130px]" />
        <div className="animate-aurora-a absolute top-[32rem] left-[30%] h-[26rem] w-[30rem] rounded-full bg-violet-600/12 blur-[140px]" />
        <div
          className="bg-grid-dark absolute inset-0"
          style={{
            maskImage:
              "radial-gradient(ellipse 85% 62% at 50% 0%, black 20%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 85% 62% at 50% 0%, black 20%, transparent 78%)",
          }}
        />
        <div className="noise-overlay absolute inset-0 opacity-[0.035]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-36 text-center sm:pt-44">
        <motion.div {...rise(0.15)}>
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 text-xs font-semibold text-mist-200 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
            </span>
            {t.badge}
          </span>
        </motion.div>

        <motion.h1
          {...rise(0.28)}
          className="mx-auto mt-7 max-w-4xl text-[clamp(2.7rem,7.2vw,5.3rem)] leading-[1.02] font-extrabold tracking-[-0.03em] text-white"
        >
          {t.titleLine1}{" "}
          <span className="text-flow-gradient font-display inline-block pr-2 font-normal italic">
            {t.titleAccent}
          </span>
        </motion.h1>

        <motion.p
          {...rise(0.42)}
          className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-mist-300 sm:text-[17px]"
        >
          {t.subtitle}
        </motion.p>

        <motion.div
          {...rise(0.55)}
          className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row"
        >
          <Magnetic strength={0.22}>
            <Link
              href="/register"
              className="group inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-bold text-night-950 shadow-[0_0_44px_-8px_rgb(129_140_248/0.65)] transition-all hover:shadow-[0_0_60px_-6px_rgb(129_140_248/0.85)]"
            >
              {t.ctaPrimary}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Magnetic>
          <Magnetic strength={0.22}>
            <a
              href="#how"
              className="group inline-flex h-12 items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.05] px-6 text-[15px] font-semibold text-mist-100 backdrop-blur transition-colors hover:border-white/25 hover:bg-white/[0.09]"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 transition-colors group-hover:bg-white/20">
                <Play className="ml-0.5 h-2.5 w-2.5 fill-current" />
              </span>
              {t.ctaSecondary}
            </a>
          </Magnetic>
        </motion.div>

        <motion.p {...rise(0.68)} className="mt-5 text-xs font-medium text-mist-500">
          {t.note}
        </motion.p>
      </div>

      <HeroScene />
    </section>
  );
}

function MarqueeStrip() {
  const t = en.landing;
  return (
    <div className="relative border-t border-white/6 py-9">
      <Reveal>
        <p className="mb-5 text-center text-[10.5px] font-bold tracking-[0.28em] text-mist-600 uppercase">
          {t.hero.trustedBy}
        </p>
      </Reveal>
      <Marquee items={t.marquee} />
    </div>
  );
}

function StatsBand() {
  const stats = en.landing.stats;
  return (
    <section className="relative overflow-hidden py-16 sm:py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-indigo-600/16 blur-[110px]" />
        <div className="bg-grid-dark absolute inset-0 opacity-60" />
      </div>
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="hairline-x mx-auto mb-14 h-px max-w-3xl" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="text-center lg:text-left">
              <dd className="text-[34px] font-extrabold tracking-tight text-white sm:text-[42px]">
                <Counter to={s.value} decimals={s.decimals ?? 0} prefix={s.prefix ?? ""} suffix={s.suffix ?? ""} />
              </dd>
              <dt className="mt-1 text-[12.5px] font-medium tracking-wide text-mist-500">
                {s.label}
              </dt>
            </Reveal>
          ))}
        </dl>
        <div className="hairline-x mx-auto mt-14 h-px max-w-3xl" />
      </div>
    </section>
  );
}

function FinalCta() {
  const t = en.landing;
  return (
    <section className="relative overflow-hidden py-24 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-aurora-b absolute -bottom-40 left-1/2 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-indigo-600/22 blur-[130px]" />
        <div
          className="bg-grid-dark absolute inset-0"
          style={{
            maskImage:
              "radial-gradient(ellipse 70% 70% at 50% 100%, black 15%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 70% at 50% 100%, black 15%, transparent 75%)",
          }}
        />
        <div className="noise-overlay absolute inset-0 opacity-[0.035]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <Reveal>
          <blockquote className="mx-auto max-w-2xl">
            <p className="font-display text-[22px] leading-snug text-mist-100 italic sm:text-[27px]">
              “{t.quote.text}”
            </p>
            <footer className="mt-4 flex items-center justify-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-teal-500 text-[11px] font-bold text-white">
                AM
              </span>
              <span className="text-left">
                <span className="block text-[13px] font-bold text-white">{t.quote.author}</span>
                <span className="block text-[11.5px] text-mist-500">{t.quote.role}</span>
              </span>
            </footer>
          </blockquote>
        </Reveal>

        <Reveal delay={0.15}>
          <h2 className="mt-16 text-[clamp(2.5rem,6.4vw,4.6rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-white">
            {t.cta.title}{" "}
            <span className="text-flow-gradient font-display inline-block pr-1 font-normal italic">
              {t.cta.titleAccent}
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[15.5px] leading-relaxed text-mist-400">
            {t.cta.sub}
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-10 flex flex-col items-center gap-4">
            <Magnetic strength={0.24}>
              <Link
                href="/register"
                className="group inline-flex h-13 items-center gap-2.5 rounded-2xl bg-white px-8 text-[16px] font-bold text-night-950 shadow-[0_0_54px_-10px_rgb(94_234_212/0.7)] transition-all hover:shadow-[0_0_72px_-8px_rgb(94_234_212/0.9)]"
              >
                <Sparkles className="h-4 w-4" />
                {t.cta.primary}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Magnetic>
            <p className="text-xs font-medium text-mist-600">{t.cta.note}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  const t = en.landing.footer;
  const links = [
    { label: t.features, href: "#features" },
    { label: t.howItWorks, href: "#how" },
    { label: t.signIn, href: "/login" },
    { label: t.register, href: "/register" },
  ];
  return (
    <footer className="border-t border-white/8 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        <Logo dark />
        <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] font-medium text-mist-400">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-mist-600">
          © {new Date().getFullYear()} {t.copyright}
        </p>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen bg-night-950 font-sans text-mist-100 antialiased">
      <SiteNav />
      <main>
        <Hero />
        <MarqueeStrip />
        <FeatureBento />
        <HowItWorks />
        <StatsBand />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
