import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-accent-press bg-accent text-white hover:bg-accent-press disabled:border-border disabled:bg-surface-hover disabled:text-disabled-text",
  secondary:
    "border border-border-strong bg-surface text-ink-strong hover:bg-surface-sunk hover:border-border-stronger disabled:border-border disabled:bg-surface disabled:text-disabled-text",
  tertiary:
    "border border-transparent bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink disabled:text-disabled-text",
  danger:
    "border border-danger-border bg-surface text-danger hover:bg-danger-bg disabled:border-border disabled:bg-surface disabled:text-disabled-text",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-[34px] px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
