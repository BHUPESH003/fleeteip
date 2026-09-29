"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastInput {
  /** Past tense and names the record: "MCH-00231 retired". */
  title: string;
  /** What changed, or for errors what to do next. */
  body?: ReactNode;
  /** Only where the reverse call exists. Extends auto-dismiss to 8 s. */
  undo?: () => void | Promise<void>;
  /** A follow-up link/button, e.g. "Reload". */
  action?: { label: string; onClick: () => void };
  /** Stable id to replace an earlier toast instead of stacking a duplicate. */
  id?: string;
}

interface ToastRecord extends ToastInput {
  id: string;
  kind: ToastKind;
}

export interface ToastApi {
  success: (input: ToastInput) => string;
  error: (input: ToastInput) => string;
  warning: (input: ToastInput) => string;
  info: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const KIND: Record<ToastKind, { edge: string; icon: IconName; iconClass: string }> = {
  success: { edge: "border-l-toast-success", icon: "success", iconClass: "text-toast-success" },
  error: { edge: "border-l-toast-error", icon: "error", iconClass: "text-toast-error" },
  warning: { edge: "border-l-toast-warning", icon: "warning", iconClass: "text-toast-warning" },
  info: { edge: "border-l-toast-info", icon: "info", iconClass: "text-toast-info" },
};

const MAX_TOASTS = 3;

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Bottom-right toasts, announced politely (errors assertively). Success,
 * info and warning vanish after 5 s (8 s with Undo) and pause while
 * hovered; errors stay until dismissed. At most three are shown.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback(
    (record: ToastRecord) => {
      if (record.kind === "error") return;
      const existing = timers.current.get(record.id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        record.id,
        setTimeout(() => dismiss(record.id), record.undo ? 8000 : 5000),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (kind: ToastKind, input: ToastInput) => {
      const id = input.id ?? Math.random().toString(36).slice(2);
      const record: ToastRecord = { ...input, id, kind };
      setToasts((list) => [...list.filter((t) => t.id !== id), record].slice(-MAX_TOASTS));
      schedule(record);
      return id;
    },
    [schedule],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (input) => push("success", input),
      error: (input) => push("error", input),
      warning: (input) => push("warning", input),
      info: (input) => push("info", input),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2"
      >
        {toasts.map((toast) => {
          const k = KIND[toast.kind];
          return (
            <div
              key={toast.id}
              role={toast.kind === "error" ? "alert" : "status"}
              onMouseEnter={() => {
                const timer = timers.current.get(toast.id);
                if (timer) clearTimeout(timer);
              }}
              onMouseLeave={() => schedule(toast)}
              className={cx(
                "pointer-events-auto grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-panel border-l-[3px] bg-rail px-3 py-[11px] shadow-toast animate-fip-in",
                k.edge,
              )}
            >
              <Icon name={k.icon} size={16} className={cx("mt-px", k.iconClass)} />
              <div className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-sm font-semibold leading-[1.35] text-white">{toast.title}</span>
                {toast.body && <span className="text-xs leading-[1.45] text-rail-body">{toast.body}</span>}
              </div>
              <div className="flex items-center gap-1">
                {toast.undo && (
                  <button
                    type="button"
                    onClick={() => {
                      const undo = toast.undo;
                      dismiss(toast.id);
                      void undo?.();
                    }}
                    className="h-[26px] rounded-cell border border-rail-control-border bg-transparent px-[9px] text-xs font-semibold text-accent-on-dark hover:bg-rail-active focus-visible:!outline-focus-on-dark"
                  >
                    Undo
                  </button>
                )}
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      dismiss(toast.id);
                      toast.action?.onClick();
                    }}
                    className="h-[26px] rounded-cell border border-rail-control-border bg-transparent px-[9px] text-xs font-semibold text-accent-on-dark hover:bg-rail-active focus-visible:!outline-focus-on-dark"
                  >
                    {toast.action.label}
                  </button>
                )}
                <IconButton
                  icon="close"
                  label="Dismiss"
                  variant="dark"
                  size="sm"
                  iconSize={13}
                  noTooltip
                  className="!h-[26px] !w-[26px] text-rail-tag"
                  onClick={() => dismiss(toast.id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
