export interface TabItem {
  key: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div className={["flex gap-1 border-b border-border", className].filter(Boolean).join(" ")}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.key)}
            className={[
              "border-b-2 px-3 py-2 text-sm",
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
  );
}
