/** Shared filename helpers for downloadable artifacts (CSV / PDF / ZIP). */

/** "August 2026" → "august-2026". */
export function slugifyFileStem(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug.length > 0 ? slug : "export";
}
