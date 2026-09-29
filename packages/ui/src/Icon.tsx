import type { SVGAttributes } from "react";

/** Circle as two arcs, so every glyph stays a single stroked <path>. */
const C = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/**
 * FleetIP icon vocabulary — path data copied from
 * design/design_handoff_machine_detail/FleetIP Icon.dc.html (`P` map).
 * 16px grid, 1.5 stroke, round caps/joins. One glyph per concept everywhere:
 * the same glyph is used in nav, chain steps, links and empty states.
 */
const PATHS = {
  // equipment categories
  excavator:
    "M1.5 13.5h8.5M2.5 13.5v-3h6v3M4.5 10.5V8h3l1 2.5M7.5 8l3-5 3 2-1.5 2.5M12 7.5v2.5l-1.5 1",
  crane: "M3.5 14.5V2M3.5 2.5h10.5M3.5 6l3.5-3.5M12 2.5v5.5M10.5 8h3v2h-3zM1.5 14.5h5",
  boom_pump: "M1.5 10h8.5v3H1.5zM3.5 13v1.5M8 13v1.5M6 10l3.5-5.5 4.5 2M14 6.5v4.5",
  generator: "M2 4.5h12v8H2zM8.5 6L6.5 8.8h3L7.5 11.5M4 12.5V14M12 12.5V14",
  roller: C(4, 11.5, 2.5) + "M6.5 11.5h3.5M10 7.5h3.5V14H10zM4 9V4.5h5l1 3",
  truck: "M1.5 4h8v7.5h-8zM9.5 6.5h3l2 2.5v2.5h-5" + C(4, 12.75, 1.25) + C(12, 12.75, 1.25),
  // modules
  machine: "M2 12.5h12M3.5 12.5V6.5h6v6M9.5 8.5h3l1.5 2v2M5 4.5h3v2H5z",
  project: "M3.5 14.5V2M3.5 2.5h9l-2 3 2 3h-9",
  requirement: "M3.5 2h9v12.5h-9zM6 5.5h4M6 8h4M6 10.5h2.5",
  quotation: "M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5M6 5.5h2",
  auction: "M9.5 2l4.5 4.5M8 3.5l4.5 4.5M9 5l-6.5 6.5 2 2L11 7M9 14.5h5.5",
  work_order: "M4 1.5h8v13H4zM6 5h4M6 7.5h4M8.5 11.5l1.2 1.2 2-2.4",
  rental: "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M5.5 9.5h2.5",
  transport: "M1.5 4h8v7.5h-8zM9.5 6.5h3l2 2.5v2.5h-5" + C(4, 12.75, 1.25) + C(12, 12.75, 1.25),
  logsheet: "M4 2.5h8v12H4zM6 1.5h4v2H6zM6 7h4M6 9.5h4M6 12h2",
  maintenance:
    "M10.2 1.8a3.2 3.2 0 0 0-2.9 4.4L2 11.5 4.5 14l5.3-5.3a3.2 3.2 0 0 0 4.4-2.9L12.3 7.7 10.5 7.4 10.2 5.6z",
  invoice: "M3.5 1.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1zM6 5h4M6 7.5h4M6 10h2.5",
  payment: "M1.5 4h13v8h-13zM1.5 7h13M4 10h2.5",
  document: "M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3",
  notification: "M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14.5h3",
  organization:
    "M2.5 14.5v-11h6v11M8.5 6.5h5v8M1.5 14.5h13M4.5 6h2M4.5 8.5h2M4.5 11h2M10.5 9h1M10.5 11.5h1",
  user: C(8, 5.25, 2.75) + "M2.5 14.5a5.5 5.5 0 0 1 11 0",
  catalogue: "M2 2.5h5v5H2zM9 2.5h5v5H9zM2 9.5h5v5H2zM9 9.5h5v5H9z",
  dashboard: "M2 2h5v6H2zM9 2h5v3.5H9zM9 7.5h5V14H9zM2 10h5v4H2z",
  // status
  success: C(8, 8, 6.5) + "M5.3 8.2l1.8 1.8 3.6-3.8",
  warning: "M8 1.8l6.7 12H1.3zM8 6.3v3.4M8 11.8v.01",
  error: C(8, 8, 6.5) + "M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4",
  info: C(8, 8, 6.5) + "M8 7.3v4M8 4.8v.01",
  lock: "M3.5 7.5h9v7h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5",
  clock: C(8, 8, 6.5) + "M8 4.5v3.8l2.5 1.5",
  offline:
    "M2 2l12 12M5.2 9.3A4.4 4.4 0 0 1 8 8.3M2.3 6.3A8 8 0 0 1 5.5 4.5M10.8 5a8 8 0 0 1 2.9 1.4M8 12.5v.01",
  // actions
  plus: "M8 3v10M3 8h10",
  menu: "M2.5 4h11M2.5 8h11M2.5 12h11",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  chevron_down: "M4 6l4 4 4-4",
  chevron_right: "M6 4l4 4-4 4",
  back: "M13 8H3M7 4L3 8l4 4",
  search: C(7, 7, 4.5) + "M14 14l-3.8-3.8",
  filter: "M2 3h12l-4.5 5.5v5l-3-1.5V8.5z",
  export: "M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11",
  close: "M4 4l8 8M12 4l-8 8",
  edit: "M11 2.5l2.5 2.5L6 12.5H3.5V10z",
  external: "M9 2.5h4.5V7M13.5 2.5l-6 6M12 9.5v4H2.5V4h4",
  undo: "M5 5.5h5a3.5 3.5 0 0 1 0 7H6M5 5.5L7.5 3M5 5.5L7.5 8",
  refresh: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3",
  retire: "M2 3h12v3H2zM3 6v8h10V6M6.5 9h3",
  check: "M3 8.5l3 3 7-7",
  calendar_check: "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M5.5 10l1.8 1.6 3.2-3.3",
} as const;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "name"> {
  name: IconName;
  /** Pixel size of the square icon. Default 16. */
  size?: number;
  /**
   * Accessible name. When given the icon is announced as an image
   * (`role="img"`); otherwise it is decorative and hidden from screen
   * readers — the default, because icons always sit next to a word.
   */
  label?: string;
  /** Stroke width; "more" defaults to 2.4 so its dots read at 16px. */
  strokeWidth?: number;
}

export function Icon({ name, size = 16, label, strokeWidth, className, style, ...props }: IconProps) {
  const sw = strokeWidth ?? (name === "more" ? 2.4 : 1.5);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      focusable="false"
      className={className}
      style={{ display: "block", flex: "none", ...style }}
      {...props}
    >
      <path d={PATHS[name] ?? PATHS.document} />
    </svg>
  );
}
