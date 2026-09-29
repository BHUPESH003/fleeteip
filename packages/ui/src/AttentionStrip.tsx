import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * Compact "Needs attention" band for list pages — only rendered when at
 * least one item has a non-zero count. Each item states a derived
 * consequence ("4 machines idle longer than 30 days"); clicking one applies
 * the matching filter. Record pages use AttentionList instead.
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
    <section
      aria-label="Needs attention"
      className={cx(
        "flex flex-wrap items-stretch overflow-hidden rounded-panel border border-accent-wash-border bg-accent-wash",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-attention">
        <Icon name="warning" size={13} className="text-sev-warning" />
        Needs attention
      </div>
      {visible.map((item) => {
        const itemClassName = cx(
          "flex items-center gap-2 border-0 border-l border-accent-wash-border bg-transparent px-4 py-2 text-left",
          item.onClick && "cursor-pointer hover:bg-white/50",
        );
        const content = (
          <>
            <span className="font-mono text-sm font-semibold leading-none text-attention">{item.count}</span>
            <span className="text-xs leading-tight text-ink-strong">{item.text}</span>
            {item.onClick && <Icon name="chevron_right" size={12} className="text-accent-text" />}
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
    </section>
  );
}
