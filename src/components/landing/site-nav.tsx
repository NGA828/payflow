"use client";

/** Floating glass pill nav — enters from above, tightens on scroll. */
import Link from "next/link";
import * as React from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { en } from "@/i18n/en";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const t = en.landing.nav;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 32));

  return (
    <motion.header
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
    >
      <div
        className={cn(
          "mt-4 flex h-14 w-full max-w-5xl items-center gap-6 rounded-2xl border px-4 backdrop-blur-xl transition-all duration-500 sm:px-5",
          scrolled
            ? "border-white/12 bg-night-950/85 shadow-[0_16px_50px_-12px_rgb(0_0_0/0.7)]"
            : "border-white/10 bg-white/[0.05]",
        )}
      >
        <Link href="/" aria-label="PayFlow home" className="shrink-0">
          <Logo dark />
        </Link>
        <nav className="mx-auto hidden items-center gap-7 text-[13.5px] font-medium text-mist-300 md:flex">
          <a href="#features" className="transition-colors hover:text-white">
            {t.features}
          </a>
          <a href="#how" className="transition-colors hover:text-white">
            {t.howItWorks}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/login"
            className="hidden rounded-lg px-3.5 py-2 text-[13.5px] font-semibold text-mist-200 transition-colors hover:bg-white/8 hover:text-white sm:block"
          >
            {t.signIn}
          </Link>
          <Link
            href="/register"
            className="group inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-[13px] font-bold text-night-950 shadow-[0_0_24px_-6px_rgb(255_255_255/0.5)] transition-all hover:bg-mist-200 hover:shadow-[0_0_32px_-4px_rgb(255_255_255/0.6)]"
          >
            {t.cta}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
