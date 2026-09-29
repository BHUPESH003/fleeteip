import type { IconName } from "@fleetip/ui";

/**
 * Category glyphs come from the catalogue category — never picked per
 * screen. Matched on the category code (then name) so categories created
 * later through catalogue admin still get a sensible glyph; anything
 * unknown (e.g. LOADER, which has no glyph yet) falls back to `machine`.
 */
const RULES: Array<{ match: RegExp; icon: IconName }> = [
  { match: /EXCAV/i, icon: "excavator" },
  { match: /CRANE/i, icon: "crane" },
  { match: /BOOM|PUMP|CONCRETE|PLACER/i, icon: "boom_pump" },
  { match: /GENERAT|GENSET|\bDG\b/i, icon: "generator" },
  { match: /COMPACT|ROLLER/i, icon: "roller" },
  { match: /TRUCK|TIPPER|TRAILER|DUMPER/i, icon: "truck" },
];

export function categoryIcon(category: { code?: string | null; name?: string | null } | null | undefined): IconName {
  if (!category) return "machine";
  const haystack = `${category.code ?? ""} ${category.name ?? ""}`;
  return RULES.find((rule) => rule.match.test(haystack))?.icon ?? "machine";
}
