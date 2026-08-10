"use client";

/**
 * Bento 2.0 feature grid — asymmetric cells, each with a live miniature of the
 * product: animated calc stack, cycling approval flow, draw-in reports chart.
 */
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  Building2,
  CircleCheck,
  Landmark,
  ShieldCheck,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Counter, EASE_OUT, Reveal, Spotlight } from "./motion-kit";
import { en } from "@/i18n/en";
import { cn } from "@/lib/utils";

/* ---- mini visual: payroll calculation stack ------------------------------ */
const calcRows = [
  { label: "Base salary", value: "+350 000", kind: "add" },
  { label: "Overtime · 6h", value: "+42 500", kind: "add" },
  { label: "Housing allowance", value: "+75 000", kind: "add" },
  { label: "CNPS · 4.2%", value: "−19 587", kind: "sub" },
  { label: "IRPP", value: "−34 026", kind: "sub" },
] as const;

function CalcStack() {
  return (
    <div className="w-full rounded-xl border border-border bg-canvas p-3 sm:max-w-64">
      {calcRows.map((r, i) => (
        <motion.div
          key={r.label}
          className="flex items-center justify-between border-b border-dashed border-border/80 py-1.5 last:border-0"
          initial={{ opacity: 0, x: 14 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.15 + i * 0.13, duration: 0.6, ease: EASE_OUT }}
        >
          <span className="text-[11px] text-body">{r.label}</span>
          <span
            className={cn(
              "tnum text-[11px] font-semibold",
              r.kind === "sub" ? "text-rose-600" : "text-ink",
            )}
          >
            {r.value}
          </span>
        </motion.div>
      ))}
      <div className="mt-1.5 flex items-center justify-between rounded-lg bg-ink px-2.5 py-2">
        <span className="text-[11px] font-semibold text-white/80">Net pay</span>
        <span className="text-[13px] font-extrabold text-white">
          XAF <Counter to={413887} duration={2} />
        </span>
      </div>
    </div>
  );
}

/* ---- mini visual: approval status flip ----------------------------------- */
function ApprovalFlow() {
  const reduce = useReducedMotion();
  const [approved, setApproved] = React.useState(false);
  React.useEffect(() => {
    if (reduce) {
      setApproved(true);
      return;
    }
    const id = setInterval(() => setApproved((v) => !v), 2800);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className="w-full max-w-64 rounded-xl border border-border bg-canvas p-3.5">
      <div className="flex items-center gap-2">
        <span className="flex -space-x-1.5">
          {["AC", "TB"].map((t) => (
            <span
              key={t}
              className="grid h-6 w-6 place-items-center rounded-full border-2 border-canvas bg-gradient-to-br from-indigo-500 to-teal-500 text-[8px] font-bold text-white"
            >
              {t}
            </span>
          ))}
        </span>
        <span className="text-[11px] font-semibold text-ink">Run MAR-26</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {["Processed", "Approved"].map((s, i) => (
          <React.Fragment key={s}>
            <span
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-500",
                i === 0 || approved ? "bg-teal-500" : "bg-slate-200",
              )}
            />
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2 flex h-6 items-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={approved ? "ok" : "wait"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
              approved ? "bg-success-tint text-success" : "bg-warning-tint text-warning",
            )}
          >
            <BadgeCheck className="h-3 w-3" />
            {approved ? "Approved by Admin" : "Awaiting approval"}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---- mini visual: branded payslip ---------------------------------------- */
function PayslipMini() {
  return (
    <div className="group/doc relative grid w-full place-items-center pt-1 pb-2">
      <div className="w-40 rotate-[-5deg] rounded-lg border border-border bg-white p-3 shadow-pop transition-transform duration-500 group-hover/doc:rotate-0">
        <div className="flex items-center gap-1.5 border-b border-border pb-2">
          <span className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-indigo-500 to-teal-500">
            <Wallet className="h-2.5 w-2.5 text-white" />
          </span>
          <span className="text-[8px] font-extrabold tracking-[0.16em] text-ink uppercase">
            Payslip
          </span>
          <span className="ml-auto rounded bg-indigo-50 px-1 py-0.5 text-[7px] font-bold text-primary-700">
            PDF
          </span>
        </div>
        <div className="space-y-1.5 py-2">
          <div className="h-1.5 w-3/4 rounded bg-slate-100" />
          <div className="h-1.5 w-full rounded bg-slate-100" />
          <div className="h-1.5 w-2/3 rounded bg-slate-100" />
        </div>
        <div className="flex items-center justify-between rounded bg-slate-100 px-2 py-1.5">
          <span className="text-[7px] font-bold text-body uppercase">Net pay</span>
          <span className="tnum text-[9px] font-extrabold text-ink">486 500 XAF</span>
        </div>
      </div>
    </div>
  );
}

/* ---- mini visual: payment rails ------------------------------------------ */
const rails: { label: string; sub: string; Icon: LucideIcon; dot: string }[] = [
  { label: "MTN MoMo", sub: "Instant payout", Icon: Smartphone, dot: "bg-amber-400" },
  { label: "Orange Money", sub: "Instant payout", Icon: Smartphone, dot: "bg-orange-500" },
  { label: "Bank CSV", sub: "Bulk file", Icon: Landmark, dot: "bg-indigo-500" },
  { label: "Cash", sub: "Tracked + signed", Icon: Wallet, dot: "bg-emerald-500" },
];

function RailsChips() {
  return (
    <div className="grid w-full max-w-72 grid-cols-2 gap-2">
      {rails.map((r, i) => (
        <motion.div
          key={r.label}
          className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-2.5 py-2"
          initial={{ opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.1 + i * 0.12, type: "spring", stiffness: 220, damping: 16 }}
        >
          <span className={cn("relative flex h-2 w-2 rounded-full", r.dot)}>
            <span
              className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", r.dot)}
            />
          </span>
          <span>
            <span className="block text-[10.5px] font-bold text-ink">{r.label}</span>
            <span className="block text-[8.5px] text-muted">{r.sub}</span>
          </span>
          <r.Icon className="ml-auto h-3 w-3 text-muted" />
        </motion.div>
      ))}
    </div>
  );
}

/* ---- mini visual: security checklist ------------------------------------- */
function SecurityChecklist() {
  const items = ["Tenant isolation", "Encrypted payment details", "Immutable audit log"];
  return (
    <ul className="w-full max-w-72 space-y-2">
      {items.map((label, i) => (
        <motion.li
          key={label}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-3 py-2"
          initial={{ opacity: 0, x: -14 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.12 + i * 0.18, duration: 0.55, ease: EASE_OUT }}
        >
          <CircleCheck className="h-4 w-4 text-teal-600" strokeWidth={2.2} />
          <span className="text-[11.5px] font-semibold text-ink">{label}</span>
          <ShieldCheck className="ml-auto h-3.5 w-3.5 text-muted" />
        </motion.li>
      ))}
    </ul>
  );
}

/* ---- mini visual: reports chart (wide) ------------------------------------ */
function ReportsChart() {
  const reduce = useReducedMotion();
  return (
    <div className="relative w-full">
      <svg viewBox="0 0 640 190" className="h-44 w-full sm:h-52" aria-hidden="true">
        <defs>
          <linearGradient id="rep-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4f46e5" stopOpacity="0.22" />
            <stop offset="1" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 70, 110, 150].map((yy) => (
          <line key={yy} x1="0" y1={yy} x2="640" y2={yy} stroke="#eef0f4" strokeWidth="1" />
        ))}
        <path
          d="M0,140 C60,132 100,110 150,118 C200,126 240,88 300,96 C360,104 400,66 460,74 C520,82 580,52 640,42"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="1.6"
          strokeDasharray="6 6"
        />
        <motion.path
          d="M0,118 C55,112 95,84 145,92 C195,100 235,58 295,66 C355,74 395,38 455,46 C515,54 575,24 640,14 L640,190 L0,190 Z"
          fill="url(#rep-area)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.9, duration: 1.1 }}
        />
        <motion.path
          d="M0,118 C55,112 95,84 145,92 C195,100 235,58 295,66 C355,74 395,38 455,46 C515,54 575,24 640,14"
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2.6"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />
        <motion.circle
          cx="640"
          cy="14"
          r="4.5"
          fill="#4f46e5"
          stroke="#fff"
          strokeWidth="2"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 1.7 }}
        />
      </svg>
      <div className="mt-1 flex justify-between px-0.5 text-[9.5px] font-semibold tracking-wider text-muted uppercase">
        {["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

/* ---- the bento grid -------------------------------------------------------- */
const cellIcons: LucideIcon[] = [Building2, BadgeCheck, Wallet, Smartphone, ShieldCheck, Landmark];

export function FeatureBento() {
  const t = en.landing.features;
  const visuals = [CalcStack, ApprovalFlow, PayslipMini, RailsChips, SecurityChecklist, ReportsChart];
  const spans = [
    "sm:col-span-2 lg:col-span-2",
    "",
    "",
    "",
    "",
    "sm:col-span-2 lg:col-span-3",
  ];

  return (
    <section id="features" className="relative z-10 -mt-7 rounded-t-[2.5rem] bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary-600 uppercase">
            The workspace
          </p>
          <h2 className="mt-3 max-w-xl text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink sm:text-[40px]">
            {t.heading}
          </h2>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">{t.sub}</p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.items.map((f, i) => {
            const Visual = visuals[i] ?? ReportsChart;
            const Icon = cellIcons[i] ?? Building2;
            return (
              <Reveal key={f.title} delay={(i % 3) * 0.09} className={cn(spans[i])}>
                <Spotlight className="group h-full rounded-2xl border border-border bg-white p-6 shadow-card transition-all duration-500 hover:-translate-y-1 hover:shadow-pop sm:p-7">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-center self-start rounded-lg bg-indigo-50 p-2 transition-colors duration-500 group-hover:bg-indigo-100">
                      <Icon className="h-4.5 w-4.5 text-primary-600" strokeWidth={1.9} />
                    </div>
                    <h3 className="mt-4 text-[16.5px] font-bold tracking-tight text-ink">
                      {f.title}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-body">{f.body}</p>
                    {i === 0 ? (
                      <div className="mt-6 flex flex-1 items-end justify-center sm:justify-start">
                        <Visual />
                      </div>
                    ) : (
                      <div className="mt-6 flex flex-1 items-center justify-center">
                        <Visual />
                      </div>
                    )}
                  </div>
                </Spotlight>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
