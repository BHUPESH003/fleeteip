export interface TabItem {
  key: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div className={["overflow-x-auto border-b border-border", className].filter(Boolean).join(" ")}>
      <div className="flex w-max min-w-full gap-1" role="tablist">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            title={item.title}
            onClick={() => !item.disabled && onChange(item.key)}
            className={[
              "shrink-0 border-b-2 px-3 py-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
              isActive
                ? "border-accent font-semibold text-ink"
                : "border-transparent font-medium text-meta hover:text-ink",
              item.disabled && "cursor-not-allowed text-border-strong hover:text-border-strong",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {item.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}
