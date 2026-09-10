import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300",
  secondary:
    "border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:bg-white",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={[
        "rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
