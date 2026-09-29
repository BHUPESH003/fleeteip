"use client";

import type { SessionSummary } from "@fleetip/contracts/identity";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormBanner,
  Panel,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "@fleetip/ui";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT, describeError } from "../../../lib/errors";
import { useAction, useForm } from "../../../lib/form";
import { formatDateTime, formatRelativeTime } from "../../../lib/format";
import { useLoad, type LoadState } from "../../../lib/use-load";
import { PasswordInput, newPasswordField } from "../../(public)/fields";

// Mirrors changePasswordRequestSchema (newPassword = signup's passwordSchema, 10–200).
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: newPasswordField(10, 200),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.newPassword, { path: ["confirm"], message: "The two passwords don't match." })
  .transform(({ currentPassword, newPassword }) => ({ currentPassword, newPassword }));

const EMPTY = { currentPassword: "", newPassword: "", confirm: "" };
const PASSWORD_STATUS_COPY = {
  429: { title: "Too many attempts", body: "For security, wait a minute before trying again." },
};

/** "Chrome on Windows" from a user-agent string — a hint for recognising a device, not detection. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** Your own account, not the organization's: password change and signed-in devices. */
export function SecurityTab({ online }: { online: boolean }) {
  const sessions = useLoad(() => apiClient.listSessions().then((r) => r?.sessions ?? []), []);
  return (
    <div className="grid grid-cols-1 items-start gap-3.5 min-[1180px]:grid-cols-2">
      <ChangePasswordPanel online={online} onChanged={() => void sessions.reload()} />
      <SessionsPanel sessions={sessions} online={online} />
    </div>
  );
}

function ChangePasswordPanel({ online, onChanged }: { online: boolean; onChanged: () => void }) {
  const toast = useToast();
  const form = useForm({
    schema: passwordSchema,
    initial: EMPTY,
    failTitle: "Your password wasn't changed",
    statusCopy: PASSWORD_STATUS_COPY,
  });

  const save = form.submit(async (body) => {
    await apiClient.changePassword(body);
    toast.success({ title: "Password changed", body: "Every other device signed in to your account has been signed out." });
    form.reset(EMPTY);
    onChanged();
  });

  return (
    <Panel title="Password" icon="lock">
      <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-3.5">
        {form.banner && (
          <FormBanner tone="error" title={form.banner.title}>
            {form.banner.body}
          </FormBanner>
        )}
        <PasswordInput label="Current password" required autoComplete="current-password" {...form.field("currentPassword")} />
        <PasswordInput label="New password" required autoComplete="new-password" {...form.field("newPassword")} />
        <PasswordInput label="Confirm new password" required autoComplete="new-password" {...form.field("confirm")} />
        <p className="m-0 text-xs leading-[1.5] text-ink-soft">
          Changing it signs you out on every other device. This one stays signed in.
        </p>
        <div>
          <Button type="submit" busy={form.busy} busyLabel="Saving…" disabled={!online} title={!online ? OFFLINE_HINT : undefined}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function SessionsPanel({ sessions, online }: { sessions: LoadState<SessionSummary[]>; online: boolean }) {
  const action = useAction();
  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current);

  const signOut = (session: SessionSummary) =>
    action.run(() => apiClient.revokeSession(session.id), {
      failTitle: "That device wasn't signed out",
      report: "toast",
      success: () => ({ title: "Signed out", body: `${deviceLabel(session.userAgent)} is no longer signed in.` }),
      onDone: () => sessions.setData((previous) => previous?.filter((s) => s.id !== session.id) ?? previous),
      onFailed: () => void sessions.reload(),
    });

  const signOutOthers = () =>
    action.run(() => apiClient.revokeOtherSessions(), {
      failTitle: "Other devices weren't signed out",
      report: "toast",
      success: () => ({ title: "Signed out everywhere else", body: "Only this device is still signed in." }),
      onDone: () => sessions.setData((previous) => previous?.filter((s) => s.current) ?? previous),
    });

  return (
    <Panel
      title="Signed-in devices"
      icon="user"
      padding="none"
      count={sessions.data ? list.length : undefined}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void signOutOthers()}
          busy={action.busy}
          disabled={!online || others.length === 0}
          title={!online ? OFFLINE_HINT : others.length === 0 ? "No other device is signed in." : undefined}
        >
          Sign out everywhere else
        </Button>
      }
    >
      {sessions.error && !sessions.data ? (
        <div className="p-4">
          <ErrorState
            title="Devices didn't load"
            message={describeError(sessions.error).body}
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void sessions.reload()}>
                Try again
              </Button>
            }
          />
        </div>
      ) : !sessions.data ? (
        <Table bare minWidth={520} caption="Loading signed-in devices">
          <SessionsHead />
          <TableSkeleton columns={4} rows={2} label="Loading signed-in devices" />
        </Table>
      ) : list.length === 0 ? (
        <EmptyState title="No signed-in devices" description="Devices show here after they sign in." />
      ) : (
        <Table bare minWidth={520} caption="Devices signed in to your account">
          <SessionsHead />
          <Tbody>
            {list.map((session) => (
              <Tr key={session.id}>
                <Td>{deviceLabel(session.userAgent)}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">{formatDateTime(session.createdAt)}</Td>
                <Td className="whitespace-nowrap text-xs">{formatRelativeTime(session.lastSeenAt)}</Td>
                <Td align="right">
                  {session.current ? (
                    <Badge tone="info" size="sm">
                      This device
                    </Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void signOut(session)}
                      disabled={!online || action.busy}
                      title={!online ? OFFLINE_HINT : undefined}
                      aria-label={`Sign out ${deviceLabel(session.userAgent)}, signed in ${formatDateTime(session.createdAt)}`}
                    >
                      Sign out
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Panel>
  );
}

function SessionsHead() {
  return (
    <Thead>
      <Tr>
        <Th>Device</Th>
        <Th>Signed in</Th>
        <Th>Last active</Th>
        <Th className="w-[1%]">
          <span className="sr-only">Actions</span>
        </Th>
      </Tr>
    </Thead>
  );
}
