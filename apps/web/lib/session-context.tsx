"use client";

import type { AuthenticatedSession } from "@fleetip/contracts/identity";
import type { MembershipWithOrganization, PermissionCode } from "@fleetip/contracts/organization";
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
import { ApiError, apiClient } from "./api-client";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionContextValue {
  status: SessionStatus;
  session: AuthenticatedSession | null;
  currentOrganizationId: string | null;
  currentMembership: MembershipWithOrganization | null;
  setCurrentOrganizationId: (organizationId: string) => void;
  hasPermission: (permission: PermissionCode) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// ponytail: last-selected org remembered per-browser via localStorage —
// not synced anywhere, just a convenience so a reload doesn't fall back to
// memberships[0] when the user was looking at a different organization.
const STORAGE_KEY = "fleetip.currentOrganizationId";

function readStoredOrganizationId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrganizationId(organizationId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, organizationId);
  } catch {
    // per-viewer convenience only — nothing to recover here
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const [currentOrganizationId, setCurrentOrganizationIdState] = useState<string | null>(null);

  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const result = (await apiClient.me()) as AuthenticatedSession;
      setSession(result);
      setStatus("authenticated");
      setCurrentOrganizationIdState((previous) => {
        const candidate = previous ?? readStoredOrganizationId();
        const stillMember = result.memberships.some((m) => m.organizationId === candidate);
        return stillMember ? candidate : (result.memberships[0]?.organizationId ?? null);
      });
    } catch (error) {
      // Only a 401 means the session is gone. A 429, a 5xx or a network
      // blip keeps whatever we have and tries again shortly.
      if (!(error instanceof ApiError) || error.status !== 401) {
        retryTimer.current = setTimeout(() => void refresh(), 3000);
        return;
      }
      setSession(null);
      setStatus("unauthenticated");
      setCurrentOrganizationIdState(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => clearTimeout(retryTimer.current);
  }, [refresh]);

  const setCurrentOrganizationId = useCallback((organizationId: string) => {
    setCurrentOrganizationIdState(organizationId);
    writeStoredOrganizationId(organizationId);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      setSession(null);
      setStatus("unauthenticated");
      setCurrentOrganizationIdState(null);
    }
  }, []);

  const currentMembership = useMemo(
    () => session?.memberships.find((m) => m.organizationId === currentOrganizationId) ?? null,
    [session, currentOrganizationId],
  );

  const hasPermission = useCallback(
    (permission: PermissionCode) => currentMembership?.permissions.includes(permission) ?? false,
    [currentMembership],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      currentOrganizationId,
      currentMembership,
      setCurrentOrganizationId,
      hasPermission,
      refresh,
      logout,
    }),
    [
      status,
      session,
      currentOrganizationId,
      currentMembership,
      setCurrentOrganizationId,
      hasPermission,
      refresh,
      logout,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within a SessionProvider");
  return context;
}
