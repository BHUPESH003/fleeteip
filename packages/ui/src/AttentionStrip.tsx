/**
 * "Needs attention" band (design system section 06) — only ever rendered
 * when at least one item has a non-zero count. Each item states a real,
 * derived consequence ("4 machines idle longer than 30 days"), not a
 * decorative KPI; clicking one should navigate to the equivalent filtered
 * list (wire `onSelect`/`href` at the call site).
 */

export interface AttentionItem {
  key: string;
  count: number;
  text: string;
  onClick?: () => void;
}

export interface AttentionStripProps {
  items: AttentionItem[];
  className?: string;
}

export function AttentionStrip({ items, className }: AttentionStripProps) {
  const visible = items.filter((item) => item.count > 0);
  if (visible.length === 0) return null;

  return (
    <div
      className={[
        "flex items-stretch overflow-hidden rounded-control border border-accent-wash-border border-l-[3px] border-l-accent bg-accent-wash",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-attention">
        Needs attention
      </div>
      {visible.map((item) => {
        const itemClassName = [
          "flex items-center gap-2 border-l border-accent-wash-border px-4 py-2 text-left",
          item.onClick ? "cursor-pointer hover:bg-white/40" : "",
        ].join(" ");
        const content = (
          <>
            <span className="font-mono text-sm font-semibold leading-none text-attention">{item.count}</span>
            <span className="text-xs leading-tight text-ink-strong">{item.text}</span>
            {item.onClick && <span className="text-xs font-semibold text-accent-text">→</span>}
          </>
        );
        return item.onClick ? (
          <button key={item.key} type="button" onClick={item.onClick} className={itemClassName}>
            {content}
          </button>
        ) : (
          <div key={item.key} className={itemClassName}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
