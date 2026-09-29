"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * Form fields follow one rule set (UX pass §06):
 * - the label says whether the field is required or optional, in words;
 * - an error sits under the field with the fix in a sentence (red, blocks submit);
 * - a warning sits under the field too (amber, never blocks submit);
 * - hint text explains the field and is replaced by the message when one shows;
 * - messages are linked with aria-describedby.
 */
export interface FieldStateProps {
  label?: ReactNode;
  /** Writes "required" next to the label and sets aria-required. */
  required?: boolean;
  /** Suppress the "optional" marker (e.g. inline filters with no label semantics). */
  hideOptional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  warning?: ReactNode;
}

export function FieldLabel({
  htmlFor,
  id,
  required,
  hideOptional,
  children,
}: {
  htmlFor?: string;
  id?: string;
  required?: boolean;
  hideOptional?: boolean;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} id={id} className="text-xs font-medium leading-tight text-ink-strong">
      {children}
      {required ? (
        <span className="ml-1 font-normal text-destructive">required</span>
      ) : hideOptional ? null : (
        <span className="ml-1 font-normal text-meta-light">optional</span>
      )}
    </label>
  );
}

export function FieldMessage({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: "error" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-1.5 text-xs leading-[1.45]",
        tone === "error" ? "text-destructive" : "text-attention",
      )}
    >
      <Icon name={tone === "error" ? "error" : "warning"} size={13} className="mt-px" />
      <span>{children}</span>
    </span>
  );
}

export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="text-[11px] leading-[1.4] text-meta-light">
      {children}
    </span>
  );
}

/** Border/ring classes for a control box in its current state. */
export function controlStateClasses(state: { error?: boolean; warning?: boolean; disabled?: boolean }) {
  if (state.error) return "border-[1.5px] border-danger-edge";
  if (state.warning) return "border-[1.5px] border-warning-edge";
  return "border border-border-control focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(210,100,12,0.14)]";
}

interface FieldShellProps extends FieldStateProps {
  id: string;
  className?: string;
  children: ReactNode;
}

function describedBy(id: string, props: FieldStateProps): string | undefined {
  if (props.error) return `${id}-msg`;
  if (props.warning) return `${id}-msg`;
  if (props.hint) return `${id}-hint`;
  return undefined;
}

/** Label + control + message/hint column. Renders the bare control when there's no label/message. */
export function FieldShell({ id, label, required, hideOptional, hint, error, warning, className, children }: FieldShellProps) {
  if (!label && !error && !warning && !hint) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={cx("flex min-w-0 flex-col gap-[5px]", className)}>
      {label && (
        <FieldLabel htmlFor={id} required={required} hideOptional={hideOptional}>
          {label}
        </FieldLabel>
      )}
      {children}
      {error ? (
        <FieldMessage id={`${id}-msg`} tone="error">
          {error}
        </FieldMessage>
      ) : warning ? (
        <FieldMessage id={`${id}-msg`} tone="warning">
          {warning}
        </FieldMessage>
      ) : hint ? (
        <FieldHint id={`${id}-hint`}>{hint}</FieldHint>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Input

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix">,
    FieldStateProps {
  /** Unit shown attached to the right of the box, e.g. "h", "L", "days". */
  suffix?: ReactNode;
  /** Shown attached to the left, e.g. "₹". */
  prefix?: ReactNode;
  /** Monospace value — codes, dates, money, counts. */
  mono?: boolean;
  size?: "sm" | "md";
  /** Classes for the <input> itself; `className` goes on the outer wrapper. */
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    required,
    hideOptional,
    hint,
    error,
    warning,
    suffix,
    prefix,
    mono,
    size = "md",
    id,
    className,
    inputClassName,
    disabled,
    ...props
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const state = { label, required, hint, error, warning };
  return (
    <FieldShell id={inputId} {...state} hideOptional={hideOptional} className={className}>
      <div
        className={cx(
          "flex w-full items-stretch overflow-hidden rounded-control bg-surface",
          size === "md" ? "h-[34px]" : "h-7",
          controlStateClasses({ error: Boolean(error), warning: Boolean(warning) }),
          disabled && "bg-surface-page",
        )}
      >
        {prefix && (
          <span className="flex flex-none items-center border-r border-border-soft bg-[#f7f8fa] px-2.5 text-xs text-meta">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, state)}
          className={cx(
            "min-w-0 flex-1 bg-transparent px-2.5 text-sm text-ink outline-none placeholder:text-meta-light disabled:cursor-not-allowed disabled:text-disabled-text",
            mono && "font-mono",
            inputClassName,
          )}
          {...props}
        />
        {suffix && (
          <span className="flex flex-none items-center border-l border-border-soft bg-[#f7f8fa] px-2.5 text-xs text-meta">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
});

// ---------------------------------------------------------------- Select

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">,
    FieldStateProps {
  options: SelectOption[];
  /** Adds a first, empty option with this text (e.g. "Choose a reason"). */
  placeholder?: string;
  size?: "sm" | "md";
  selectClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    required,
    hideOptional,
    hint,
    error,
    warning,
    options,
    placeholder,
    size = "md",
    id,
    className,
    selectClassName,
    disabled,
    ...props
  },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const state = { label, required, hint, error, warning };
  return (
    <FieldShell id={selectId} {...state} hideOptional={hideOptional} className={className}>
      <div
        className={cx(
          "relative flex w-full items-stretch rounded-control bg-surface",
          size === "md" ? "h-[34px]" : "h-7",
          controlStateClasses({ error: Boolean(error), warning: Boolean(warning) }),
          disabled && "bg-surface-page",
        )}
      >
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(selectId, state)}
          className={cx(
            "w-full min-w-0 cursor-pointer appearance-none rounded-control bg-transparent pl-2.5 pr-8 text-sm text-ink outline-none disabled:cursor-not-allowed disabled:text-disabled-text",
            selectClassName,
          )}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron_down"
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-meta"
        />
      </div>
    </FieldShell>
  );
});

// ---------------------------------------------------------------- Textarea

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldStateProps {
  textareaClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, required, hideOptional, hint, error, warning, id, className, textareaClassName, rows = 3, ...props },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const state = { label, required, hint, error, warning };
  return (
    <FieldShell id={textareaId} {...state} hideOptional={hideOptional} className={className}>
      <div
        className={cx(
          "flex w-full rounded-control bg-surface",
          controlStateClasses({ error: Boolean(error), warning: Boolean(warning) }),
        )}
      >
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(textareaId, state)}
          className={cx(
            "min-h-[64px] w-full resize-y rounded-control bg-transparent px-2.5 py-2 text-sm leading-[1.5] text-ink outline-none placeholder:text-meta-light",
            textareaClassName,
          )}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

// ---------------------------------------------------------------- Checkbox

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cx("flex items-start gap-[9px]", className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={description ? `${inputId}-desc` : undefined}
        className="mt-px h-4 w-4 flex-none cursor-pointer accent-accent disabled:cursor-not-allowed"
        {...props}
      />
      <span className="flex flex-col gap-[3px]">
        <label htmlFor={inputId} className="cursor-pointer text-sm font-medium leading-tight text-ink-strong">
          {label}
        </label>
        {description && (
          <span id={`${inputId}-desc`} className="text-[11px] leading-[1.4] text-meta-light">
            {description}
          </span>
        )}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------- RadioGroup

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends FieldStateProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  className?: string;
  direction?: "row" | "column";
}

export function RadioGroup({
  label,
  required,
  hideOptional,
  hint,
  error,
  warning,
  name,
  value,
  onChange,
  options,
  className,
  direction = "row",
}: RadioGroupProps) {
  const id = useId();
  return (
    <fieldset
      className={cx("m-0 flex min-w-0 flex-col gap-[5px] border-0 p-0", className)}
      aria-describedby={error || warning ? `${id}-msg` : hint ? `${id}-hint` : undefined}
    >
      {label && (
        <legend className="mb-[5px] p-0 text-xs font-medium leading-tight text-ink-strong">
          {label}
          {required ? (
            <span className="ml-1 font-normal text-destructive">required</span>
          ) : hideOptional ? null : (
            <span className="ml-1 font-normal text-meta-light">optional</span>
          )}
        </legend>
      )}
      <div className={cx("flex gap-x-5 gap-y-2", direction === "column" ? "flex-col" : "flex-wrap")}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-2">
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 flex-none cursor-pointer accent-accent"
              />
              <label htmlFor={optionId} className="flex cursor-pointer flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight text-ink-strong">{option.label}</span>
                {option.description && (
                  <span className="text-[11px] leading-[1.4] text-meta-light">{option.description}</span>
                )}
              </label>
            </div>
          );
        })}
      </div>
      {error ? (
        <FieldMessage id={`${id}-msg`} tone="error">
          {error}
        </FieldMessage>
      ) : warning ? (
        <FieldMessage id={`${id}-msg`} tone="warning">
          {warning}
        </FieldMessage>
      ) : hint ? (
        <FieldHint id={`${id}-hint`}>{hint}</FieldHint>
      ) : null}
    </fieldset>
  );
}

/** Uppercase section label inside a form ("What it is", "How you identify it"). */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{title}</h3>
        {description && <p className="m-0 text-xs leading-[1.5] text-ink-soft">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Non-field problem inside a form (409 conflict, network failure) — names the record, keeps input. */
export function FormBanner({
  tone = "error",
  title,
  children,
  action,
}: {
  tone?: "error" | "warning" | "info";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    error: "border-destructive-border bg-destructive-wash text-destructive",
    warning: "border-attention-border bg-attention-wash text-attention",
    info: "border-on-rent/20 bg-on-rent-bg text-on-rent",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-control border px-3 py-2.5", styles)}>
      <Icon name={tone === "info" ? "info" : tone} size={15} className="mt-px" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <span className="text-sm font-semibold leading-snug">{title}</span>}
        {children && <span className="text-xs leading-[1.5] text-ink-body">{children}</span>}
        {action && <div className="mt-0.5">{action}</div>}
      </div>
    </div>
  );
}
