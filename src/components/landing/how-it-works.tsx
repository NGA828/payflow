"use client";

/** Three-step story with a scroll-linked progress spine. */
import * as React from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { FileSpreadsheet, ScanSearch, Send, type LucideIcon } from "lucide-react";
import { Reveal } from "./motion-kit";
import { en } from "@/i18n/en";

const stepIcons: LucideIcon[] = [FileSpreadsheet, ScanSearch, Send];

export function HowItWorks() {
  const t = en.landing.how;
  const reduce = useReducedMotion();
  const listRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: listRef,
    offset: ["start 72%", "end 55%"],
  });
  const spine = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <section id="how" className="border-t border-border/60 bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.22em] text-teal-600 uppercase">
              How it works
            </p>
            <h2 className="mt-3 max-w-sm text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink sm:text-[40px]">
              {t.heading}
            </h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">{t.sub}</p>
          </Reveal>
        </div>

        <div ref={listRef} className="relative">
          {/* spine */}
          <div className="absolute top-2 bottom-2 left-[27px] w-px bg-slate-200" aria-hidden />
          <motion.div
            aria-hidden
            className="absolute top-2 bottom-2 left-[27px] w-px origin-top bg-gradient-to-b from-indigo-500 to-teal-500"
            style={reduce ? { scaleY: 1, x: "-0.5px" } : { scaleY: spine, x: "-0.5px" }}
          />

          <div className="space-y-12">
            {t.steps.map((s, i) => {
              const Icon = stepIcons[i] ?? FileSpreadsheet;
              return (
                <Reveal key={s.title} delay={i * 0.08}>
                  <div className="flex gap-6">
                    <div className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border bg-white shadow-card">
                      <Icon className="h-5 w-5 text-primary-600" strokeWidth={1.8} />
                      <span className="absolute -top-2 -right-2 grid h-5.5 w-5.5 place-items-center rounded-full bg-ink text-[9px] font-extrabold text-white">
                        {i + 1}
                      </span>
                    </div>
                    <div>
                      <h3 className="pt-1 text-[17px] font-bold tracking-tight text-ink">
                        {s.title}
                      </h3>
                      <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-body">
                        {s.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
