import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

export function Select({ label, options, id, className, ...props }: SelectProps) {
  const select = (
    <select
      id={id}
      className={[
        "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900",
        "focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400",
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
  if (!label) return select;
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {select}
    </label>
  );
}
