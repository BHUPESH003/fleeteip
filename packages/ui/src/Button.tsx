import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { Tooltip, type TooltipSide } from "./Tooltip";

/**
 * primary   — the one state-aware action per surface (orange).
 * secondary — outlined; every other action.
 * tertiary  — ghost; Cancel, Clear, inline actions.
 * danger    — outlined red (1.5px), for Retire/Cancel-record. Never filled red.
 */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "xs" | "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** In-flight write: disables the button (no double submit) and shows `busyLabel`. */
  busy?: boolean;
  /** Label while busy, e.g. "Saving…". Defaults to the children. */
  busyLabel?: ReactNode;
  /** @deprecated use `busy` */
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-accent font-semibold text-white hover:bg-accent-press active:bg-accent-active disabled:bg-surface-hover disabled:text-disabled-text disabled:border-border-soft",
  secondary:
    "border border-border-control bg-surface font-medium text-ink-strong hover:bg-surface-hover disabled:border-border-soft disabled:bg-surface-page disabled:text-disabled-text",
  tertiary:
    "border border-transparent bg-transparent font-medium text-ink-strong hover:bg-surface-hover disabled:text-disabled-text disabled:hover:bg-transparent",
  danger:
    "border-[1.5px] border-danger-edge bg-surface font-semibold text-destructive hover:bg-destructive-bg disabled:border-border-soft disabled:text-disabled-text disabled:hover:bg-surface",
};

const BUSY_CLASSES: Record<ButtonVariant, string> = {
  primary: "!bg-disabled-accent !text-disabled-accent-text !border-transparent",
  secondary: "!bg-surface-page !text-meta-light",
  tertiary: "!text-meta-light",
  danger: "!text-meta-light !border-border-control",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "h-[26px] px-2.5 text-xs gap-1.5",
  sm: "h-7 px-[11px] text-xs gap-1.5",
  md: "h-[34px] px-[14px] text-sm gap-[7px]",
};

const ICON_SIZE: Record<ButtonSize, number> = { xs: 13, sm: 13, md: 15 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    busy,
    busyLabel,
    loading,
    disabled,
    icon,
    iconRight,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const isBusy = Boolean(busy || loading);
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex flex-none items-center justify-center whitespace-nowrap rounded-control leading-none transition-colors",
        "disabled:cursor-not-allowed",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        isBusy && cx("cursor-progress", BUSY_CLASSES[variant]),
        className,
      )}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      {...props}
    >
      {isBusy ? (
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon && <Icon name={icon} size={ICON_SIZE[size]} />
      )}
      {isBusy && busyLabel ? busyLabel : children}
      {iconRight && !isBusy && <Icon name={iconRight} size={ICON_SIZE[size] - 2} />}
    </button>
  );
});

export type IconButtonVariant = "secondary" | "ghost" | "dark";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Required accessible name — also shown as the tooltip. */
  label: string;
  variant?: IconButtonVariant;
  size?: "sm" | "md";
  tooltipSide?: TooltipSide;
  /** Hide the visual tooltip (e.g. inside a menu trigger that shows its own). */
  noTooltip?: boolean;
  iconSize?: number;
}

const ICON_BUTTON_VARIANTS: Record<IconButtonVariant, string> = {
  secondary:
    "border border-border-control bg-surface text-ink-strong hover:bg-surface-hover aria-expanded:bg-surface-hover disabled:text-disabled-text",
  ghost:
    "border border-transparent bg-transparent text-ink-strong hover:bg-surface-hover disabled:text-disabled-text",
  dark: "border border-transparent bg-transparent text-white hover:bg-rail-active focus-visible:!outline-focus-on-dark",
};

/**
 * Icon-only button (More, Close, Dismiss, Menu). Icon-only is allowed only
 * for these; each carries an accessible name and a tooltip that also shows
 * on keyboard focus (a plain `title` doesn't).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    variant = "secondary",
    size = "md",
    tooltipSide = "bottom",
    noTooltip,
    iconSize,
    className,
    type = "button",
    ...props
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(
        "inline-flex flex-none items-center justify-center rounded-control p-0 transition-colors disabled:cursor-not-allowed",
        size === "md" ? "h-[34px] w-[34px]" : "h-7 w-7",
        ICON_BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={iconSize ?? (size === "md" ? 16 : 14)} />
    </button>
  );
  if (noTooltip) return button;
  return (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
