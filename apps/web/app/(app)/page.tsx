"use client";

import type { Requirement } from "@fleetip/contracts/rfq";
import type { CommercialQuotation } from "@fleetip/contracts/quotation";
import type { Rental } from "@fleetip/contracts/rental";
import { Card, LoadingState, PageHeader } from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { useSession } from "../../lib/session-context";

interface DashboardStat {
  label: string;
  count: number;
  href: string | null;
}

export default function DashboardPage() {
  const { session, currentMembership, hasPermission } = useSession();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStat[]>([]);

  useEffect(() => {
    const organizationId = currentMembership?.organizationId;
    if (!organizationId) return;
    setLoading(true);
    void (async () => {
      // listRequirements only ever returns "my own posted requirements" —
      // it's rfq.manage (Renter)-only. A Rental Company's equivalent view is
      // the marketplace-wide discoverRequirements list, which isn't "mine"
      // in the same sense, so it isn't reduced to a dashboard count here.
      const canSeeRequirements = hasPermission("rfq.manage");
      const canSeeQuotations =
        hasPermission("quotation.manage") || hasPermission("quotation.respond");
      const canSeeRentals = hasPermission("rental.manage") || hasPermission("rental.respond");

      const [requirements, quotations, rentals, notifications] = await Promise.all([
        canSeeRequirements
          ? (apiClient.listRequirements(organizationId) as Promise<Requirement[]>)
          : Promise.resolve([]),
        canSeeQuotations
          ? (apiClient.listQuotations(organizationId) as Promise<CommercialQuotation[]>)
          : Promise.resolve([]),
        canSeeRentals
          ? (apiClient.listRentals(organizationId) as Promise<Rental[]>)
          : Promise.resolve([]),
        apiClient.listNotifications(organizationId) as Promise<{ unreadCount: number }>,
      ]);

      const nextStats: DashboardStat[] = [];
      if (canSeeRequirements) {
        nextStats.push({
          label: "Open requirements",
          count: requirements.filter((r) => r.status === "open").length,
          href: "/requirements",
        });
      }
      if (canSeeQuotations) {
        nextStats.push({
          label: "Quotations in progress",
          count: quotations.filter((q) => q.status === "sent" || q.status === "negotiating")
            .length,
          href: "/quotations",
        });
      }
      if (canSeeRentals) {
        nextStats.push({
          label: hasPermission("rental.respond") ? "Machines on rent" : "Active rentals",
          count: rentals.filter((r) => r.status === "active" || r.status === "confirmed").length,
          href: "/rentals",
        });
      }
      nextStats.push({
        label: "Unread notifications",
        count: notifications.unreadCount,
        href: null,
      });

      setStats(nextStats);
      setLoading(false);
    })();
  }, [currentMembership?.organizationId, hasPermission]);

  return (
    <>
      <PageHeader title={`Welcome, ${session?.user.displayName ?? ""}`} />
      {currentMembership && (
        <Card className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-gray-500">Current organization</h2>
          <p className="text-lg font-semibold text-gray-900">
            {currentMembership.organization.name}
          </p>
          <p className="text-sm text-gray-500">
            {currentMembership.organization.code} ·{" "}
            {currentMembership.organization.organizationTypeCode} · {currentMembership.roleName}
          </p>
        </Card>
      )}

      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const tile = (
              <Card
                className={stat.href ? "transition hover:border-gray-300 hover:shadow-sm" : ""}
              >
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{stat.count}</p>
              </Card>
            );
            return stat.href ? (
              <Link key={stat.label} href={stat.href}>
                {tile}
              </Link>
            ) : (
              <div key={stat.label}>{tile}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
