export type LoadingStateSize = "panel" | "inline";

export interface LoadingStateProps {
  label?: string;
  size?: LoadingStateSize;
  className?: string;
}

const SIZE_CLASSES: Record<LoadingStateSize, string> = {
  panel: "py-12",
  inline: "py-2",
};

export function LoadingState({ label = "Loading…", size = "panel", className }: LoadingStateProps) {
  return (
    <div
      className={[
        "flex items-center justify-center gap-2 text-sm text-meta",
        SIZE_CLASSES[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
      {label}
    </div>
  );
}
