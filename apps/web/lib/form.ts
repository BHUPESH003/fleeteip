"use client";

import { useToast, type ToastInput } from "@fleetip/ui";
import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { isoDate } from "@fleetip/contracts/shared";
import type { ZodType, ZodTypeDef } from "zod";
import { useConnection } from "./connection";
import { OFFLINE_HINT, toFormFailure, type StatusCopy } from "./errors";

/**
 * Forms and one-click writes, the same way everywhere:
 *
 *   const form = useForm({ schema, initial, failTitle: "Changes weren't saved" });
 *   <Input label="Asset code" {...form.field("assetCode")} />
 *   <FormBanner error={form.banner} />
 *   <Button onClick={form.submit(async (body) => { await apiClient.save(body); onDone(); })} busy={form.busy} />
 *
 * The schema holds the rules and their wording (it turns the raw input
 * strings into the request body). Errors show once a field is touched or
 * after the first submit; a server message stays until that field changes.
 * API failures are mapped by toFormFailure — no try/catch in the form.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Errors<V> = Partial<Record<keyof V & string, string>>;
type Banner = { title: string; body: string } | null;

export interface UseFormOptions<V extends Record<string, unknown>, Body> {
  /** Raw form values → request body. Messages here are what users read. */
  schema: ZodType<Body, ZodTypeDef, V>;
  initial: V;
  /** Banner title when a save fails: what didn't happen ("MCH-12 wasn't saved"). */
  failTitle: string;
  /** Per-field copy for a 409 the API ties to that field. */
  conflicts?: Partial<Record<keyof V & string, string>>;
  /** Banner copy for a status this screen words itself (e.g. 401 on sign-in, 409 with no field). */
  statusCopy?: StatusCopy;
  /** Show rule errors before any blur or submit (confirm dialogs whose button is disabled while invalid). */
  eager?: boolean;
}

export function useForm<V extends Record<string, unknown>, Body>(options: UseFormOptions<V, Body>) {
  const { schema, failTitle, conflicts, statusCopy, eager = false } = options;
  const { online } = useConnection();
  const [initial, setInitial] = useState(options.initial);
  const [values, setValues] = useState(options.initial);
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors<V>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const initialRef = useRef(options.initial);

  const parsed = schema.safeParse(values);
  const ruleErrors: Errors<V> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "") as keyof V & string;
      ruleErrors[key] ??= issue.message;
    }
  }
  // Every date field gets the API's range rule (current year ± 50) here,
  // once, instead of in each form's schema. Date inputs always hold
  // "YYYY-MM-DD", so that shape is how a date field is recognised.
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string" || !ISO_DATE.test(value)) continue;
    const range = isoDate().safeParse(value);
    if (!range.success) ruleErrors[key as keyof V & string] ??= range.error.issues[0]?.message;
  }
  const valid = parsed.success && Object.keys(ruleErrors).length === 0;

  /** Whether this field's problems should show yet (touched, submitted once, or eager). */
  const shown = (name: keyof V & string): boolean => eager || tried || Boolean(touched[name]);
  const errorOf = (name: keyof V & string): string | undefined =>
    serverErrors[name] ?? (shown(name) ? ruleErrors[name] : undefined);

  /** Show a failure from a save that isn't wrapped by submit() (e.g. one of several writes). */
  const fail = useCallback(
    (error: unknown) => {
      const failure = toFormFailure(error, failTitle, conflicts as Record<string, string> | undefined, statusCopy);
      // Issues for fields this form doesn't have would vanish — say them in the banner instead.
      const known: Errors<V> = {};
      const unknown: string[] = [];
      for (const [path, message] of Object.entries(failure.fieldErrors)) {
        if (path in initialRef.current) known[path as keyof V & string] = message;
        else unknown.push(message);
      }
      setServerErrors(known);
      setBanner(
        unknown.length
          ? { title: failure.banner?.title ?? "Some entries need attention", body: [failure.banner?.body, ...unknown].filter(Boolean).join(" ") }
          : failure.banner,
      );
    },
    [failTitle, conflicts, statusCopy],
  );

  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setServerErrors((previous) => (previous[name as keyof V & string] ? { ...previous, [name]: undefined } : previous));
  }, []);

  /** Props for @fleetip/ui Input / Select / Textarea bound to one string field. */
  function field<K extends keyof V & string>(name: K) {
    return {
      name,
      value: values[name] as unknown as string,
      error: errorOf(name),
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(name, event.target.value as V[K]),
      onBlur: () => setTouched((previous) => ({ ...previous, [name]: true })),
    };
  }

  /** Wraps the save: validates, blocks offline and double-submits, maps API failures. Resolves true on success. */
  function submit(save: (body: Body) => Promise<void>) {
    return async (event?: FormEvent): Promise<boolean> => {
      event?.preventDefault();
      setTried(true);
      setBanner(null);
      if (busyRef.current) return false;
      if (!parsed.success || !valid) {
        const first = parsed.success ? Object.keys(ruleErrors)[0] : parsed.error.issues[0]?.path[0];
        const target =
          (first !== undefined && document.querySelector<HTMLElement>(`[name="${String(first)}"]`)) ||
          document.querySelector<HTMLElement>('[aria-invalid="true"]');
        target?.focus();
        return false;
      }
      if (!online) {
        setBanner({ title: failTitle, body: OFFLINE_HINT });
        return false;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        await save(parsed.data);
        return true;
      } catch (error) {
        fail(error);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };
  }

  /** Start over from these values (e.g. when a dialog reopens on another record). */
  const reset = useCallback((next: V) => {
    initialRef.current = next;
    setInitial(next);
    setValues(next);
    setTouched({});
    setTried(false);
    setServerErrors({});
    setBanner(null);
  }, []);

  const dirty = (Object.keys(values) as Array<keyof V>).some((key) => !Object.is(values[key], initial[key]));

  return {
    values,
    set,
    field,
    submit,
    fail,
    shown,
    reset,
    busy,
    banner,
    dirty,
    online,
    /** True when the current values pass the schema (enable the submit button on it if you like). */
    valid,
    errors: Object.fromEntries(Object.keys(values).map((key) => [key, errorOf(key as keyof V & string)])) as Errors<V>,
  };
}

/**
 * A write with no form — confirm dialogs, status changes, one-click actions:
 *
 *   const action = useAction();
 *   const complete = () => action.run(() => apiClient.completeRental(orgId, id), {
 *     failTitle: `${ref} wasn't completed`,
 *     success: (rental) => ({ title: `${ref} completed` }),
 *     onDone: (rental) => { onClose(); onChanged(rental); },
 *   });
 *   <ConfirmDialog busy={action.busy} error={action.banner} onConfirm={complete} ... />
 */
export function useAction() {
  const toast = useToast();
  const { online } = useConnection();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const busyRef = useRef(false);

  async function run<T>(call: () => Promise<T>, options: ActionOptions<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    setBanner(null);
    const report = (failure: NonNullable<Banner>) =>
      options.report === "toast" ? toast.error(failure) : setBanner(failure);
    if (!online) {
      report({ title: options.failTitle, body: OFFLINE_HINT });
      return undefined;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await call();
      if (options.success) toast.success(options.success(result));
      options.onDone?.(result);
      return result;
    } catch (error) {
      const failure = toFormFailure(error, options.failTitle, undefined, options.statusCopy).banner;
      if (failure) report(failure);
      options.onFailed?.(error);
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const clear = useCallback(() => setBanner(null), []);
  return { run, busy, banner, clear };
}

export interface ActionOptions<T> {
  /** What didn't happen, as the banner/toast title ("RN-12 wasn't completed"). */
  failTitle: string;
  /** Success toast, built from the call's result. */
  success?: (result: T) => ToastInput;
  onDone?: (result: T) => void;
  /** Runs after the failure is reported (e.g. reload a list that may have changed). */
  onFailed?: (error: unknown) => void;
  /** "banner" (default) for dialogs; "toast" for row and header buttons with nowhere to put a banner. */
  report?: "banner" | "toast";
  /** Banner copy for a status this screen words itself. */
  statusCopy?: StatusCopy;
}
