"use client";

import { useState } from "react";
import { ApiError } from "../lib/api-client";

type Banner = { title: string; body: string };

/**
 * Screen-specific copy for a status that useForm/useAction word generically:
 * a 409 the API ties to no field, a 401 on a sign-in form. `guard` records
 * the copy and rethrows, so the hook still stops (no success toast, no
 * onDone). Show `status.banner ?? form.banner`.
 * ponytail: stopgap until useForm/useAction accept per-status copy (lib/form.ts).
 */
export function useStatusCopy(copy: Partial<Record<number, Banner>>, onMatch?: (status: number) => void) {
  const [banner, setBanner] = useState<Banner | null>(null);

  async function guard<T>(call: () => Promise<T>): Promise<T> {
    setBanner(null);
    try {
      return await call();
    } catch (error) {
      const special = error instanceof ApiError ? copy[error.status] : undefined;
      if (special) {
        setBanner(special);
        onMatch?.((error as ApiError).status);
      }
      throw error;
    }
  }

  return { banner, guard, clear: () => setBanner(null) };
}
