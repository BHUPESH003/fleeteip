import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({ label, error, options, id, className, ...props }: SelectProps) {
  const select = (
    <select
      id={id}
      className={[
        "h-[34px] w-full rounded-control border px-2 text-sm text-ink outline-none",
        error
          ? "border-danger-border"
          : "border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/15",
        "disabled:bg-surface-sunk disabled:text-disabled-text",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  if (!label && !error) return select;
  return (
    <label className="mb-3 flex flex-col gap-1.5">
      {label && (
        <span className={["text-xs font-medium", error ? "text-danger" : "text-ink-muted"].join(" ")}>
          {label}
        </span>
      )}
      {select}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
