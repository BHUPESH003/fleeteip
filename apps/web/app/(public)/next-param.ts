/**
 * Where to go after signing in. The (app) shell sends signed-out visitors
 * to /login?next=<path>; only same-origin relative paths are honoured — a
 * value must start with "/" and not "//" or "/\" (browsers treat "\" as
 * "/", so "/\evil.com" would leave the site). Anything else, and the auth
 * pages themselves, fall back to the dashboard.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    // Control characters (tabs and newlines are stripped by URL parsers, which can turn "/\t/x" into "//x").
    if (code < 0x20 || code === 0x7f) return "/";
  }
  try {
    const base = "http://fleetip.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.pathname === "/login" || url.pathname === "/signup") return "/";
    return path;
  } catch {
    return "/";
  }
}

/** "?next=%2Fmachines" to carry the destination between the sign-in and sign-up pages. */
export function nextQuery(next: string): string {
  return next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
}
