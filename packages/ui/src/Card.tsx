import type { HTMLAttributes } from "react";

export type CardPadding = "none" | "sm" | "md";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-3.5",
  md: "p-6",
};

export function Card({ padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-panel border border-border bg-surface",
        PADDING_CLASSES[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
