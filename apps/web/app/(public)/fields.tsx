"use client";

import { Input, type InputProps } from "@fleetip/ui";
import { forwardRef, useState } from "react";
import { z } from "zod";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors the contracts' email check (identity emailSchema) closely enough to catch typos before sending. Trims. */
export function emailField(empty = "Enter your email address.") {
  return z.string().trim().min(1, empty).regex(EMAIL_PATTERN, "Enter an email address like name@company.com.");
}

/** A new password: at least `min` characters (and at most `max`), with the count in the message. */
export function newPasswordField(min: number, max?: number) {
  return z.string().superRefine((value, ctx) => {
    const message = !value
      ? `Choose a password of at least ${min} characters.`
      : value.length < min
        ? `Use at least ${min} characters. This one has ${value.length}.`
        : max !== undefined && value.length > max
          ? `Passwords are up to ${max} characters. This one has ${value.length}.`
          : null;
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });
}

/** Password input with a Show/Hide toggle (a real button, announced as pressed/not pressed). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "suffix">>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          className="border-0 bg-transparent p-0 text-xs font-medium text-ink-strong hover:underline"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
});
