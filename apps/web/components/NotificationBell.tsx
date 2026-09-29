"use client";

import type { Notification, NotificationListResponse } from "@fleetip/contracts/notification";
import { Dropdown, Icon, cx } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api-client";
import { formatRelativeTime } from "../lib/format";
import { ROUTE_BY_RESOURCE_TYPE } from "../lib/navigation";
import { useSession } from "../lib/session-context";
import { useInterval } from "../lib/use-interval";

const UNREAD_POLL_INTERVAL_MS = 25_000;


/**
 * Bell with the count of stored, unread notifications (FleetIP sends no
 * time-based reminders — that needs a scheduler, backend ticket i).
 */
export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { currentOrganizationId } = useSession();
  const router = useRouter();
  const [data, setData] = useState<NotificationListResponse>({ notifications: [], unreadCount: 0 });
  const [loadFailed, setLoadFailed] = useState(false);

  async function load() {
    if (!currentOrganizationId) return;
    try {
      setData((await apiClient.listNotifications(currentOrganizationId)) as NotificationListResponse);
      setLoadFailed(false);
    } catch {
      // Best-effort — the bell keeps its last-known state.
      setLoadFailed(true);
    }
  }

  useEffect(() => {
    void load();
  }, [currentOrganizationId]);

  useInterval(() => void load(), UNREAD_POLL_INTERVAL_MS, Boolean(currentOrganizationId));

  async function handleOpenNotification(notification: Notification) {
    if (!currentOrganizationId) return;
    if (!notification.readAt) {
      try {
        await apiClient.markNotificationRead(currentOrganizationId, notification.id);
        void load();
      } catch {
        // Navigation still proceeds even if marking-as-read failed.
      }
    }
    const buildPath = notification.relatedResourceType && ROUTE_BY_RESOURCE_TYPE[notification.relatedResourceType];
    if (buildPath && notification.relatedResourceId) router.push(buildPath(notification.relatedResourceId));
  }

  async function handleMarkAllRead() {
    if (!currentOrganizationId) return;
    try {
      await apiClient.markAllNotificationsRead(currentOrganizationId);
      void load();
    } catch {
      // Best-effort.
    }
  }

  if (!currentOrganizationId) return null;
  const unread = data.unreadCount;

  return (
    <Dropdown
      align="right"
      triggerLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      triggerClassName={cx(
        "relative h-8 w-8 justify-center",
        tone === "dark"
          ? "text-white hover:bg-rail-active focus-visible:!outline-focus-on-dark"
          : "border border-border-control bg-surface text-ink-strong hover:bg-surface-hover",
      )}
      panelClassName="w-[min(360px,calc(100vw-24px))] p-0"
      trigger={
        <>
          <Icon name="notification" size={16} />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-semibold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <span className="text-sm font-semibold text-ink">Notifications</span>
        {unread > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleMarkAllRead();
            }}
            className="text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {loadFailed && data.notifications.length === 0 ? (
          <p className="m-0 px-3.5 py-4 text-sm text-ink-soft">Notifications couldn&apos;t be loaded. They&apos;ll retry shortly.</p>
        ) : data.notifications.length === 0 ? (
          <p className="m-0 px-3.5 py-4 text-sm text-ink-soft">No notifications yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {data.notifications.map((notification) => {
              const isUnread = !notification.readAt;
              return (
                <li key={notification.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => void handleOpenNotification(notification)}
                    className={cx(
                      "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface-page focus-visible:outline-2 focus-visible:-outline-offset-2",
                      isUnread && "bg-on-rent-bg/60",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx("mt-1.5 h-1.5 w-1.5 flex-none rounded-full", isUnread ? "bg-accent" : "bg-transparent")}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cx("text-sm leading-snug text-ink", isUnread ? "font-semibold" : "font-medium")}>
                        {isUnread && <span className="sr-only">Unread: </span>}
                        {notification.title}
                      </span>
                      <span className="text-xs leading-[1.45] text-ink-muted">{notification.message}</span>
                      <span className="text-[11px] text-meta-light">{formatRelativeTime(notification.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dropdown>
  );
}
