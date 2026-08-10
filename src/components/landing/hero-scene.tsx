"use client";

/**
 * Hero 3D scene — a glassmorphic payroll dashboard floating in perspective,
 * surrounded by layered cards at different translateZ depths. Springed pointer
 * parallax, idle float loops, orbital ring, particles and a perspective grid
 * floor. Transform-only — GPU friendly. Decorative: aria-hidden.
 */
import * as React from "react";
import { motion, useReducedMotion, useSpring, useTransform, useMotionValue } from "motion/react";
import {
  BadgeCheck,
  Banknote,
  FileText,
  LayoutGrid,
  Lock,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { Counter, EASE_OUT } from "./motion-kit";
import { cn } from "@/lib/utils";

/* ---- demo data (decorative mock content) -------------------------------- */
const rows = [
  { initials: "AM", name: "A. Mbarga", dept: "Logistics · Douala", amt: "486 500", paid: true },
  { initials: "TN", name: "T. Ngo Bell", dept: "Finance · Yaoundé", amt: "612 300", paid: true },
  { initials: "SE", name: "S. Ekane", dept: "Operations · Bafoussam", amt: "358 900", paid: false },
] as const;

const particles = [
  { left: "8%", top: "62%", size: 3, delay: "0s", dur: "11s" },
  { left: "16%", top: "38%", size: 2, delay: "2.4s", dur: "13s" },
  { left: "24%", top: "74%", size: 4, delay: "5s", dur: "10s" },
  { left: "70%", top: "30%", size: 2, delay: "1.2s", dur: "12s" },
  { left: "80%", top: "58%", size: 3, delay: "3.6s", dur: "9.5s" },
  { left: "88%", top: "44%", size: 2, delay: "6.4s", dur: "12.5s" },
  { left: "93%", top: "70%", size: 3, delay: "4.4s", dur: "10.5s" },
  { left: "42%", top: "20%", size: 2, delay: "7.2s", dur: "14s" },
  { left: "58%", top: "16%", size: 3, delay: "8s", dur: "12s" },
] as const;

const pill = (tone: "green" | "amber") =>
  cn(
    "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide",
    tone === "green"
      ? "border-emerald-300/20 bg-emerald-400/15 text-emerald-300"
      : "border-amber-300/20 bg-amber-400/15 text-amber-300",
  );

/* ---- the dashboard mock ------------------------------------------------- */
function DashboardMock({ reduce }: { reduce: boolean }) {
  return (
    <div className="glass-panel relative w-[min(88vw,700px)] overflow-hidden rounded-2xl text-left">
      {/* sheen sweep */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="animate-sheen absolute inset-y-0 w-24 bg-white/[0.06] blur-md" />
      </div>

      {/* browser chrome */}
      <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
        </span>
        <span className="mx-auto flex h-6 w-56 items-center justify-center gap-1.5 rounded-md bg-white/[0.05] text-[10px] font-medium text-mist-400">
          <Lock className="h-2.5 w-2.5" /> app.payflow.cm/payroll
        </span>
        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400" />
      </div>

      <div className="flex">
        {/* icon rail */}
        <div className="hidden w-12 flex-col items-center gap-3 border-r border-white/8 py-4 sm:flex">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-teal-500">
            <Banknote className="h-3 w-3 text-white" />
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-white">
            <LayoutGrid className="h-3.5 w-3.5" />
          </span>
          {[Users, Wallet, FileText].map((Icon, i) => (
            <span key={i} className="grid h-7 w-7 place-items-center rounded-lg text-mist-500">
              <Icon className="h-3.5 w-3.5" />
            </span>
          ))}
          <span className="mt-auto grid h-7 w-7 place-items-center rounded-lg text-mist-600">
            <Settings className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* main pane */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <p className="text-[13px] font-bold text-white">Payroll · March 2026</p>
            <span className={pill("amber")}>Draft</span>
            <span className="ml-auto rounded-md bg-white px-2.5 py-1 text-[10px] font-bold text-night-950">
              Run payroll
            </span>
          </div>

          {/* KPI row */}
          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
              <p className="text-[9.5px] font-semibold tracking-wider text-mist-500 uppercase">
                Net payable
              </p>
              <p className="mt-0.5 text-[15px] font-extrabold text-white sm:text-[17px]">
                XAF{" "}
                <Counter to={12486500} duration={2.2} />
              </p>
              <p className="mt-0.5 text-[9px] font-semibold text-emerald-300">▲ 4.2% vs Feb</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
              <p className="text-[9.5px] font-semibold tracking-wider text-mist-500 uppercase">
                Employees
              </p>
              <p className="tnum mt-0.5 text-[15px] font-extrabold text-white sm:text-[17px]">48</p>
              <p className="mt-0.5 text-[9px] font-medium text-mist-500">3 departments</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
              <p className="text-[9.5px] font-semibold tracking-wider text-mist-500 uppercase">
                Exceptions
              </p>
              <p className="tnum mt-0.5 text-[15px] font-extrabold text-white sm:text-[17px]">2</p>
              <p className="mt-0.5 text-[9px] font-semibold text-amber-300">Needs review</p>
            </div>
          </div>

          {/* chart */}
          <div className="relative mt-2.5 rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-semibold tracking-wider text-mist-500 uppercase">
                Payroll cost · 7 months
              </p>
              <span className="flex items-center gap-2 text-[9px] font-medium text-mist-400">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> Current
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1 w-3 border-t border-dashed border-mist-500" /> Prior year
                </span>
              </span>
            </div>
            <svg viewBox="0 0 560 140" className="mt-1 h-24 w-full sm:h-28" aria-hidden="true">
              <defs>
                <linearGradient id="hm-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#818cf8" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[28, 62, 96].map((yy) => (
                <line key={yy} x1="0" y1={yy} x2="560" y2={yy} stroke="rgba(255,255,255,0.05)" />
              ))}
              <path
                d="M0,108 C60,100 90,88 140,94 C190,100 220,70 280,76 C340,82 380,60 430,64 C480,68 520,52 560,44"
                fill="none"
                stroke="rgba(148,163,184,0.45)"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <motion.path
                d="M0,96 C50,92 80,72 130,78 C180,84 210,50 270,56 C330,62 360,34 420,38 C480,42 515,22 560,16 L560,140 L0,140 Z"
                fill="url(#hm-area)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.7, duration: 1 }}
              />
              <motion.path
                d="M0,96 C50,92 80,72 130,78 C180,84 210,50 270,56 C330,62 360,34 420,38 C480,42 515,22 560,16"
                fill="none"
                stroke="#818cf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.9, duration: 1.8, ease: "easeInOut" }}
              />
              <motion.circle
                cx="560"
                cy="16"
                r="4"
                fill="#818cf8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.6 }}
              />
              <motion.circle
                cx="560"
                cy="16"
                r="4"
                fill="none"
                stroke="#818cf8"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0], r: [4, 14, 4] }}
                transition={{ delay: 2.6, duration: 2.4, repeat: Infinity }}
              />
            </svg>
            <motion.span
              className="glass-panel absolute top-7 right-3 rounded-md px-2 py-1 text-[9px] font-bold text-white"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.5, duration: 0.6, ease: EASE_OUT }}
            >
              MAR · XAF 12.4M
            </motion.span>
          </div>

          {/* payslip rows */}
          <div className="mt-2.5 space-y-1.5">
            {rows.map((r, i) => (
              <motion.div
                key={r.initials}
                className="flex items-center gap-3 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.3 + i * 0.16, duration: 0.7, ease: EASE_OUT }}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500/60 to-teal-500/60 text-[8px] font-bold text-white">
                  {r.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-mist-100">
                    {r.name}
                  </span>
                  <span className="block truncate text-[9px] text-mist-500">{r.dept}</span>
                </span>
                <span className="tnum ml-auto text-[11px] font-bold text-mist-100">
                  {r.amt} <span className="text-[8px] font-medium text-mist-500">XAF</span>
                </span>
                <span className={pill(r.paid ? "green" : "amber")}>
                  {r.paid ? "Paid" : "Pending"}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- floating satellite cards ------------------------------------------- */
function PayslipToast() {
  return (
    <div className="glass-panel w-52 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/15">
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
        </span>
        <p className="text-[11px] font-bold text-white">Payslip delivered</p>
        <span className="ml-auto text-[8.5px] text-mist-500">now</span>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-mist-400">
        A. Mbarga · payslip_mar-2026.pdf · CNPS posted
      </p>
    </div>
  );
}

function NetPayCard() {
  return (
    <div className="glass-panel w-48 rounded-xl p-3.5">
      <p className="text-[9px] font-semibold tracking-wider text-mist-500 uppercase">
        Net pay · March
      </p>
      <p className="tnum mt-1 text-lg font-extrabold text-white">
        486 500 <span className="text-[10px] font-medium text-mist-500">XAF</span>
      </p>
      <svg viewBox="0 0 96 26" className="mt-1.5 w-full" aria-hidden="true">
        <motion.path
          d="M2,20 L16,16 L30,18 L44,10 L58,13 L72,6 L86,9 L94,3"
          fill="none"
          stroke="#5eead4"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 2, duration: 1.4, ease: "easeOut" }}
        />
      </svg>
      <p className="mt-1 text-[9px] font-semibold text-emerald-300">▲ 4.2% vs February</p>
    </div>
  );
}

function ApprovalCard() {
  return (
    <div className="glass-panel w-56 rounded-xl p-3.5">
      <div className="flex items-center">
        <span className="flex -space-x-1.5">
          {["AC", "TB"].map((t) => (
            <span
              key={t}
              className="grid h-6 w-6 place-items-center rounded-full border-2 border-night-900 bg-gradient-to-br from-indigo-500/70 to-teal-500/70 text-[8px] font-bold text-white"
            >
              {t}
            </span>
          ))}
        </span>
        <span className={cn(pill("green"), "ml-auto")}>Approved</span>
      </div>
      <p className="mt-2 text-[11px] font-bold text-white">Run MAR-26 approved</p>
      <p className="text-[9.5px] text-mist-400">T. Ngo Bell · Admin · 2 min ago</p>
    </div>
  );
}

/** 3D pay-token: two faces + edge glow, wobbling on the Y axis. */
function PayToken() {
  const face = (back = false) => (
    <div
      className={cn(
        "absolute inset-0 grid place-items-center rounded-full border",
        "border-teal-300/40 bg-gradient-to-br from-indigo-500 via-indigo-600 to-teal-500",
        "shadow-[inset_0_2px_6px_rgb(255_255_255/0.35),inset_0_-6px_14px_rgb(0_0_0/0.4)]",
      )}
      style={{ transform: back ? "translateZ(-3px) rotateY(180deg)" : "translateZ(3px)" }}
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8 opacity-95" aria-hidden="true">
        <path
          d="M9 21.5c3-1 4.5-6.5 7-7s4 5.5 7 4.5"
          stroke="#fff"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="9" cy="21" r="2.1" fill="#fff" />
        <circle cx="23" cy="16" r="2.1" fill="#fff" />
      </svg>
    </div>
  );
  return (
    <div className="relative h-20 w-20" style={{ transformStyle: "preserve-3d" }}>
      <div className="animate-coin absolute inset-0">
        {face(false)}
        {face(true)}
        {/* edge */}
        <div
          className="absolute inset-0 rounded-full border-[3px] border-indigo-300/50"
          style={{ transform: "translateZ(0px)" }}
        />
      </div>
      <div className="absolute -inset-3 -z-10 rounded-full bg-teal-400/25 blur-xl" />
    </div>
  );
}

/* ---- the scene ----------------------------------------------------------- */
export function HeroScene() {
  const reduce = useReducedMotion();
  const wrapRef = React.useRef<HTMLDivElement>(null);

  /* pointer rig */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springCfg = { stiffness: 55, damping: 16, mass: 0.6 };
  const rotateX = useSpring(useTransform(my, [-0.6, 0.6], [19, 6]), springCfg);
  const rotateY = useSpring(useTransform(mx, [-0.6, 0.6], [-9, 9]), springCfg);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - (rect.left + rect.width / 2)) / rect.width);
    my.set((e.clientY - (rect.top + rect.height / 2)) / rect.height);
  };

  const rig = reduce ? {} : { rotateX, rotateY };

  return (
    <div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      className="relative mx-auto mt-14 max-w-6xl px-6 pb-28 sm:mt-16"
      style={{ perspective: 1500 }}
      aria-hidden="true"
    >
      {/* orbital ring behind the dashboard */}
      <motion.div
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 sm:h-[760px] sm:w-[760px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 1, duration: 1.4 }}
      >
        <div className="animate-spin-slower h-full w-full">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <defs>
              <linearGradient id="orbit-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#818cf8" />
                <stop offset="1" stopColor="#5eead4" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="48.5"
              fill="none"
              stroke="url(#orbit-grad)"
              strokeWidth="0.28"
              strokeDasharray="64 240"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </motion.div>

      {/* particles */}
      <div className="pointer-events-none absolute inset-0">
        {particles.map((p, i) => (
          <span
            key={i}
            className="particle absolute rounded-full bg-teal-200"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          />
        ))}
      </div>

      {/* breathing floor glow */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 -z-10 flex justify-center">
        <div className="animate-glow h-36 w-[72%] rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgb(99_102_241/0.4),rgb(45_212_191/0.18)_45%,transparent_75%)] blur-2xl" />
      </div>

      {/* grid floor (horizontal fade on wrapper, vertical fade on inner) */}
      <div
        className="pointer-events-none absolute right-0 -bottom-10 left-0 -z-10 h-56 opacity-70"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 16%, black 84%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 16%, black 84%, transparent)",
        }}
      >
        <div
          className="bg-grid-floor h-full w-full"
          style={{
            transform: "perspective(900px) rotateX(62deg)",
            transformOrigin: "bottom",
            maskImage: "linear-gradient(to top, black 0%, transparent 88%)",
            WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 88%)",
          }}
        />
      </div>

      {/* 3D rig — one element owns entrance + pointer rotation + preserve-3d */}
      <div className="relative flex justify-center">
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 90, scale: 0.93 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.35, duration: 1.1, ease: EASE_OUT }}
          style={{ ...rig, transformStyle: "preserve-3d" }}
        >
          <DashboardMock reduce={!!reduce} />

          {/* floats — outer div owns translateZ depth, motion.div the entrance,
              inner div the idle float loop: three separate transform layers */}
          <div
            className="absolute -top-10 -left-6 hidden sm:block"
            style={{ transform: "translateZ(120px)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.05, type: "spring", stiffness: 160, damping: 15 }}
            >
              <div className="animate-float">
                <PayslipToast />
              </div>
            </motion.div>
          </div>

          <div
            className="absolute top-1/4 -right-10 hidden md:block"
            style={{ transform: "translateZ(170px)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.25, type: "spring", stiffness: 160, damping: 15 }}
            >
              <div className="animate-float-slow">
                <NetPayCard />
              </div>
            </motion.div>
          </div>

          <div
            className="absolute -bottom-8 left-8 hidden sm:block"
            style={{ transform: "translateZ(90px)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.45, type: "spring", stiffness: 160, damping: 15 }}
            >
              <div className="animate-float" style={{ animationDelay: "1.4s" }}>
                <ApprovalCard />
              </div>
            </motion.div>
          </div>

          <div
            className="absolute -top-14 right-6 hidden lg:block"
            style={{ transform: "translateZ(220px)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0, rotate: -40 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 1.6, type: "spring", stiffness: 120, damping: 13 }}
            >
              <PayToken />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
