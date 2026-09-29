/** Joins truthy class names — the package's only styling helper (no clsx/cva). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
