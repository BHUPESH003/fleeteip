import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className, ...props }: InputProps) {
  const input = (
    <input
      id={id}
      className={[
        "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900",
        "focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
  if (!label) return input;
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {input}
    </label>
  );
}
