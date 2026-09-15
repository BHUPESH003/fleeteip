"use client";

import type { Notification, NotificationListResponse } from "@fleetip/contracts/notification";
import { Dropdown, DropdownItem } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api-client";
import { formatRelativeTime } from "../lib/format";
import { useSession } from "../lib/session-context";
import { useInterval } from "../lib/use-interval";

const UNREAD_POLL_INTERVAL_MS = 25_000;

// Every resource type a notify() call actually sets relatedResourceType to
// (see docs/decisions.md) gets a real deep link — most have a plain [id]
// detail route; Auction and Billing invoices don't have one (they're
// selected via a query param on their list page instead).
const ROUTE_BY_RESOURCE_TYPE: Record<string, (id: string) => string> = {
  requirement: (id) => `/requirements/${id}`,
  // requirement.quotation_requested's recipient is a Rental Company, which
  // can't open /requirements/[id] at all (Renter-only) — a distinct
  // resource type routes it to where they can actually act: the create-
  // quotation flow, prefilled from the requirement.
  quotation_request: (id) => `/quotations?requirementId=${id}`,
  quotation: (id) => `/quotations/${id}`,
  auction: (id) => `/auctions?auctionId=${id}`,
  rental: (id) => `/rentals/${id}`,
  machine: (id) => `/machines/${id}`,
  transport: (id) => `/transport/${id}`,
  work_order: (id) => `/work-orders/${id}`,
  invoice: (id) => `/billing?invoiceId=${id}`,
};

export function NotificationBell() {
  const { currentOrganizationId } = useSession();
  const router = useRouter();
  const [data, setData] = useState<NotificationListResponse>({
    notifications: [],
    unreadCount: 0,
  });

  async function load() {
    if (!currentOrganizationId) return;
    try {
      setData((await apiClient.listNotifications(currentOrganizationId)) as NotificationListResponse);
    } catch {
      // Best-effort — the bell just stays at its last-known state.
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
    const buildPath =
      notification.relatedResourceType && ROUTE_BY_RESOURCE_TYPE[notification.relatedResourceType];
    if (buildPath && notification.relatedResourceId) {
      router.push(buildPath(notification.relatedResourceId));
    }
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

  if (!currentOrganizationId) return <span />;

  return (
    <Dropdown
      align="right"
      trigger={
        <span
          className="relative flex h-[30px] w-[30px] items-center justify-center rounded-control border border-border text-meta-light"
          aria-label="Notifications"
        >
          &#9662;
          {data.unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent px-[3px] text-[9px] font-semibold text-white">
              {data.unreadCount > 9 ? "9+" : data.unreadCount}
            </span>
          )}
        </span>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-ink-strong">Notifications</span>
        {data.unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="text-xs text-accent-text hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-96 w-80 overflow-y-auto">
        {data.notifications.length === 0 ? (
          <p className="px-3 py-4 text-sm text-meta">No notifications yet.</p>
        ) : (
          data.notifications.map((notification) => (
            <DropdownItem
              key={notification.id}
              onClick={() => void handleOpenNotification(notification)}
              className={notification.readAt ? undefined : "bg-info-bg"}
            >
              <p className="text-sm font-medium text-ink">{notification.title}</p>
              <p className="text-xs text-ink-muted">{notification.message}</p>
              <p className="mt-0.5 text-[11px] text-meta-light">
                {formatRelativeTime(notification.createdAt)}
              </p>
            </DropdownItem>
          ))
        )}
      </div>
    </Dropdown>
  );
}
