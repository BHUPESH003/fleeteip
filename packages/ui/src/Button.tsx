import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={["fleetip-button", `fleetip-button--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
