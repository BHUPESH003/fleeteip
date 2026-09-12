import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-panel border border-border bg-surface">
      <table className={["w-full border-collapse text-sm", className].filter(Boolean).join(" ")} {...props} />
    </div>
  );
}

export function Thead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={["border-b border-border bg-surface-sunk", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={["border-b border-border last:border-0", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc" | null;

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortDirection?: SortDirection;
  onSort?: () => void;
}

export function Th({ sortDirection, onSort, className, children, ...props }: ThProps) {
  const base = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-meta";
  if (!onSort) {
    return (
      <th className={[base, className].filter(Boolean).join(" ")} {...props}>
        {children}
      </th>
    );
  }
  return (
    <th className={[base, className].filter(Boolean).join(" ")} {...props}>
      <button
        type="button"
        onClick={onSort}
        className="inline-flex items-center gap-1 uppercase tracking-wide text-meta hover:text-ink"
      >
        {children}
        <span className="text-[10px] text-border-strong">
          {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}
        </span>
      </button>
    </th>
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={["px-4 py-2.5 text-ink", className].filter(Boolean).join(" ")} {...props} />;
}
