import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className, ...props }: InputProps) {
  const input = (
    <input id={id} className={["fleetip-input", className].filter(Boolean).join(" ")} {...props} />
  );
  if (!label) return input;
  return (
    <label className="fleetip-field">
      <span className="fleetip-field__label">{label}</span>
      {input}
    </label>
  );
}
