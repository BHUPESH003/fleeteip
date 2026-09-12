import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className, ...props }: InputProps) {
  const input = (
    <input
      id={id}
      className={[
        "h-[34px] w-full rounded-control border px-2.5 text-sm text-ink outline-none",
        error
          ? "border-danger-border"
          : "border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/15",
        "disabled:bg-surface-sunk disabled:text-disabled-text",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
  if (!label && !error) return input;
  return (
    <label className="mb-3 flex flex-col gap-1.5">
      {label && (
        <span className={["text-xs font-medium", error ? "text-danger" : "text-ink-muted"].join(" ")}>
          {label}
        </span>
      )}
      {input}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
