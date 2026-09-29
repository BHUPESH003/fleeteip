"use client";

import { useToast } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type DependencyList } from "react";
import { AdminApiError, adminApiClient } from "../../lib/admin-api-client";
import { ApiError } from "../../lib/api-client";
import { useAction } from "../../lib/form";
import { useLoad } from "../../lib/use-load";
import type { CatalogueWriter } from "../(app)/catalogue/shared";

export const STAFF_LOGIN = "/platform-admin/login";

/**
 * adminApiClient throws AdminApiError, or the browser's TypeError when the
 * request never reached the API. lib/errors.ts translates ApiError, so
 * staff calls are normalized to it (status 0 = offline).
 */
export function toApiError(error: unknown): unknown {
  if (error instanceof AdminApiError) return new ApiError(error.message, error.statusCode);
  if (error instanceof TypeError) return new ApiError("Could not reach FleetIP", 0, "network");
  return error;
}

export async function staffCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toApiError(error);
  }
}

/** The staff session ended (or never existed): 401 from any /admin route. */
export function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Sends the browser to staff sign-in when a staff session has ended. */
export function useSignedOutRedirect(error: unknown) {
  const router = useRouter();
  useEffect(() => {
    if (isSignedOut(error)) router.replace(`${STAFF_LOGIN}?ended=1`);
  }, [error, router]);
}

/** useLoad for /admin calls: normalized errors, and a redirect to staff sign-in on 401. */
export function useStaffLoad<T>(loader: () => Promise<T>, deps: DependencyList) {
  const state = useLoad(() => staffCall(loader), deps);
  useSignedOutRedirect(state.error);
  return state;
}

/**
 * useAction for /admin writes: normalized errors, a redirect to staff
 * sign-in when the session has ended, and failures as an error toast (how
 * the staff console has always reported them) rather than a banner.
 */
export function useStaffAction() {
  const action = useAction();
  const toast = useToast();
  const [signedOut, setSignedOut] = useState<unknown>(null);
  useSignedOutRedirect(signedOut);
  const { banner } = action;
  useEffect(() => {
    if (banner) toast.error(banner);
    // Only when a new failure arrives.
  }, [banner]);

  const run: typeof action.run = (call, options) =>
    action.run(
      () =>
        staffCall(call).catch((error: unknown) => {
          setSignedOut(error);
          throw error;
        }),
      options,
    );
  return { run, busy: action.busy };
}

/** The shared catalogue forms, writing through the staff endpoints (/admin/catalogue/*). */
export const staffCatalogueWriter: CatalogueWriter = {
  createCategory: (input) => staffCall(() => adminApiClient.createCategory(input)),
  updateCategory: (id, input) => staffCall(() => adminApiClient.updateCategory(id, input)),
  createSubcategory: (input) => staffCall(() => adminApiClient.createSubcategory(input)),
  updateSubcategory: (id, input) => staffCall(() => adminApiClient.updateSubcategory(id, input)),
  createProduct: (input) => staffCall(() => adminApiClient.createProduct(input)),
  updateProduct: (id, input) => staffCall(() => adminApiClient.updateProduct(id, input)),
};
