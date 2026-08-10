"use client";

/**
 * Motion primitives for the landing experience.
 * Every primitive degrades gracefully under `prefers-reduced-motion`.
 */
import * as React from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Scroll-triggered reveal: rise + de-blur, once. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 26,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(5px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-64px 0px" }}
      transition={{ duration: 0.9, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Number that counts up when it enters the viewport (fr-FR grouping for XAF). */
export function Counter({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  duration = 1.9,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-48px 0px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const fmt = React.useMemo(
    () =>
      new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [decimals],
  );
  const text = useTransform(mv, (v) => fmt.format(v));

  React.useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(to);
      return;
    }
    const controls = animate(mv, to, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [inView, reduce, mv, to, duration]);

  return (
    <span ref={ref} className={cn("tnum", className)}>
      {prefix}
      <motion.span>{text}</motion.span>
      {suffix}
    </span>
  );
}

/** Card whose glow follows the cursor (pairs with spotlight-card utilities). */
export function Spotlight({
  children,
  className,
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn(dark ? "spotlight-card-dark" : "spotlight-card", className)}
    >
      {children}
    </div>
  );
}

/** Magnetic hover: children drift toward the cursor and spring back. */
export function Magnetic({
  children,
  className,
  strength = 0.3,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 16, mass: 0.35 });
  const sy = useSpring(y, { stiffness: 200, damping: 16, mass: 0.35 });

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn("inline-block", className)}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Seamless infinite marquee (track holds exactly two copies, pauses on hover). */
export function Marquee({
  items,
  className,
  separator,
}: {
  items: React.ReactNode[];
  className?: string;
  separator?: React.ReactNode;
}) {
  const row = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          <span className="px-7 text-[13px] font-semibold tracking-[0.14em] whitespace-nowrap text-mist-400 uppercase">
            {item}
          </span>
          {separator ?? <span className="h-1 w-1 rounded-full bg-mist-600" />}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
      {/* edge fade */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-night-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-night-950 to-transparent" />
    </div>
  );
}
