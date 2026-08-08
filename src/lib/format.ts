/**
 * Locale-aware formatting helpers. XAF is a zero-decimal currency displayed
 * space-grouped: `1 250 000 XAF`. Dates render in Africa/Douala (UTC+1).
 */

export const DISPLAY_TIME_ZONE = "Africa/Douala";

const xafNumber = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Formats a whole-XAF amount like `1 250 000 XAF`. */
export function formatMoney(amount: number | string | bigint): string {
  const value =
    typeof amount === "bigint"
      ? Number(amount)
      : typeof amount === "string"
        ? Number(amount)
        : amount;
  if (!Number.isFinite(value)) return "—";
  return `${xafNumber.format(Math.round(value))} XAF`;
}

const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Space-grouped plain number, e.g. for counts in KPI tables. */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(date: Date | string): string {
  return dateFormatter.format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return `${dateTimeFormatter.format(new Date(date))} WAT`;
}

/** "August 2026" — canonical payroll period label. */
export function formatPeriodLabel(startDate: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(new Date(startDate));
}
