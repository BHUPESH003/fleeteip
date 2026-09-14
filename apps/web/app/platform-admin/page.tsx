"use client";

import type { PermissionCode } from "@fleetip/contracts/organization";
import { PERMISSION_ORGANIZATION_TYPES } from "@fleetip/contracts/organization";
import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Auction } from "@fleetip/contracts/auction";
import type {
  PlatformDashboardCounts,
  PlatformOrganization,
  PlatformUser,
} from "@fleetip/contracts/platform-admin";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { adminApiClient, AdminApiError } from "../../lib/admin-api-client";
import { apiClient } from "../../lib/api-client";
import { formatDate } from "../../lib/format";

/**
 * FleetIP Platform Admin — backed by real /admin/* endpoints, gated by a
 * real staff session (apps/api/src/modules/staff, platform-admin). Scope
 * is deliberately narrow, per the validated business decision: catalogue/
 * reference-data management, list/suspend organizations & users, and
 * read-only cross-tenant visibility into requirements/auctions. No
 * mutation of a tenant's own business records exists here or server-side.
 *
 * Visually distinct from the tenant shell on purpose (dark operational
 * chrome vs. the tenant's light surface-page) — a different persona, not a
 * mode within the tenant app — reusing the same design tokens rather than
 * inventing a new palette. Never linked from the tenant Sidebar/MobileNav.
 */

const SECTIONS = ["Overview", "Organizations", "Users", "Catalogue", "Requirements", "Auctions", "Access & roles"] as const;
type Section = (typeof SECTIONS)[number];

export default function PlatformAdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("Overview");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [staffEmail, setStaffEmail] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await adminApiClient.me();
        setStaffEmail(result!.staffUser.email);
      } catch {
        router.replace("/platform-admin/login");
        return;
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  async function handleLogout() {
    await adminApiClient.logout();
    router.replace("/platform-admin/login");
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-strong">
        <LoadingState label="Checking staff session…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-strong text-white">
      <div className="border-b border-white/10 bg-ink-strong px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-5 rounded-xs bg-warning" />
            <span className="text-[15px] font-bold tracking-wide">FleetIP · Platform Admin</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span>{staffEmail}</span>
            <button type="button" onClick={() => void handleLogout()} className="font-medium text-white/80 hover:text-white">
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={[
                  "shrink-0 rounded-control px-3 py-2 text-left text-sm font-medium",
                  section === s ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </nav>

          <div className="min-w-0 rounded-panel bg-surface p-5 text-ink">
            {section === "Overview" && <OverviewSection />}
            {section === "Organizations" && <OrganizationsSection />}
            {section === "Users" && <UsersSection />}
            {section === "Catalogue" && <CatalogueSection />}
            {section === "Requirements" && <RequirementsSection />}
            {section === "Auctions" && <AuctionsSection />}
            {section === "Access & roles" && <AccessRolesSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function useAdminGuardedError() {
  const router = useRouter();
  return (err: unknown, setError: (message: string) => void) => {
    if (err instanceof AdminApiError && err.statusCode === 401) {
      router.replace("/platform-admin/login");
      return;
    }
    setError(err instanceof Error ? err.message : "Request failed");
  };
}

function OverviewSection() {
  const handleError = useAdminGuardedError();
  const [counts, setCounts] = useState<PlatformDashboardCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminApiClient
      .getDashboard()
      .then((result) => setCounts(result!))
      .catch((err) => handleError(err, setError));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!counts) return <LoadingState label="Loading dashboard…" />;

  const tiles: { label: string; value: number }[] = [
    { label: "Organizations", value: counts.organizations },
    { label: "Users", value: counts.users },
    { label: "Open requirements", value: counts.openRequirements },
    { label: "Live/scheduled auctions", value: counts.liveAuctions },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">Platform overview</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} padding="sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-meta">{tile.label}</p>
            <p className="mt-1 font-mono text-2xl font-medium text-ink">{tile.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrganizationsSection() {
  const handleError = useAdminGuardedError();
  const [organizations, setOrganizations] = useState<PlatformOrganization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setOrganizations((await adminApiClient.listOrganizations()) ?? []);
    } catch (err) {
      handleError(err, setError);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleStatus(org: PlatformOrganization) {
    const next = org.status === "active" ? "suspended" : "active";
    try {
      await adminApiClient.setOrganizationStatus(org.id, next);
      void load();
    } catch (err) {
      handleError(err, setError);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!organizations) return <LoadingState label="Loading organizations…" />;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">Organization directory</h2>
      {organizations.length === 0 ? (
        <EmptyState title="No organizations yet" description="Every tenant organization will appear here." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Organization</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {organizations.map((org) => (
              <Tr key={org.id}>
                <Td className="font-medium text-ink">{org.name}</Td>
                <Td>{org.organizationTypeCode === "rental_company" ? "Rental company" : "Renter"}</Td>
                <Td>
                  <Badge tone={org.status === "active" ? "success" : "danger"}>{org.status}</Badge>
                </Td>
                <Td className="font-mono">{formatDate(org.createdAt)}</Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => void toggleStatus(org)}
                    className="text-xs font-medium text-accent-text"
                  >
                    {org.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      <p className="text-xs text-meta-light">
        A suspended organization loses every permission immediately — its members can no longer act
        on any resource until reactivated (enforced in PermissionService, not just hidden here).
      </p>
    </div>
  );
}

function UsersSection() {
  const handleError = useAdminGuardedError();
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setUsers((await adminApiClient.listUsers()) ?? []);
    } catch (err) {
      handleError(err, setError);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleStatus(user: PlatformUser) {
    const next = user.status === "active" ? "suspended" : "active";
    try {
      await adminApiClient.setUserStatus(user.id, next);
      void load();
    } catch (err) {
      handleError(err, setError);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!users) return <LoadingState label="Loading users…" />;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">User directory</h2>
      {users.length === 0 ? (
        <EmptyState title="No users yet" />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Email</Th>
              <Th>Display name</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {users.map((user) => (
              <Tr key={user.id}>
                <Td>{user.email}</Td>
                <Td>{user.displayName}</Td>
                <Td>
                  <Badge tone={user.status === "active" ? "success" : "danger"}>{user.status}</Badge>
                </Td>
                <Td className="font-mono">{formatDate(user.createdAt)}</Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => void toggleStatus(user)}
                    className="text-xs font-medium text-accent-text"
                  >
                    {user.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      <p className="text-xs text-meta-light">
        A suspended user cannot log in to any organization until reactivated. Passwords, credentials
        and session tokens are never shown here.
      </p>
    </div>
  );
}

function CatalogueSection() {
  const handleError = useAdminGuardedError();
  const [categories, setCategories] = useState<ProductCategory[] | null>(null);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<Record<string, ProductSubcategory[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSubcategoryFor, setAddingSubcategoryFor] = useState<string | null>(null);

  async function load() {
    try {
      const list = (await apiClient.listProductCategories()) as ProductCategory[];
      setCategories(list);
      const entries = await Promise.all(
        list.map(async (c) => [c.id, (await apiClient.listProductSubcategories(c.id)) as ProductSubcategory[]] as const),
      );
      setSubcategoriesByCategory(Object.fromEntries(entries));
    } catch (err) {
      handleError(err, setError);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await adminApiClient.createCategory({
        code: String(form.get("code")).toUpperCase(),
        name: String(form.get("name")),
      });
      setAddingCategory(false);
      void load();
    } catch (err) {
      handleError(err, setError);
    }
  }

  async function handleAddSubcategory(categoryId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await adminApiClient.createSubcategory({
        productCategoryId: categoryId,
        code: String(form.get("code")).toUpperCase(),
        name: String(form.get("name")),
      });
      setAddingSubcategoryFor(null);
      void load();
    } catch (err) {
      handleError(err, setError);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!categories) return <LoadingState label="Loading catalogue…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Catalogue administration</h2>
        {!addingCategory && (
          <Button variant="secondary" onClick={() => setAddingCategory(true)}>
            Add category
          </Button>
        )}
      </div>
      <p className="text-xs text-meta-light">
        The Product Catalogue is shared platform-wide reference data (categories → subcategories →
        products) — managed here, not per rental company.
      </p>

      {addingCategory && (
        <form onSubmit={handleAddCategory} className="flex flex-wrap items-end gap-2 rounded-panel border border-border p-3">
          <Input label="Code" name="code" placeholder="e.g. COMPACTOR" required className="max-w-[160px]" />
          <Input label="Name" name="name" placeholder="e.g. Soil Compactor" required />
          <Button type="submit">Save</Button>
          <Button type="button" variant="secondary" onClick={() => setAddingCategory(false)}>
            Cancel
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {categories.map((category) => (
          <Card key={category.id} padding="sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">
                {category.name} <span className="font-mono text-xs text-meta">({category.code})</span>
              </p>
              <button
                type="button"
                onClick={() => setAddingSubcategoryFor(addingSubcategoryFor === category.id ? null : category.id)}
                className="text-xs font-medium text-accent-text"
              >
                + Subcategory
              </button>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(subcategoriesByCategory[category.id] ?? []).map((sub) => (
                <li key={sub.id} className="rounded-xs bg-surface-sunk px-2 py-1 text-xs text-ink">
                  {sub.name}
                </li>
              ))}
              {(subcategoriesByCategory[category.id] ?? []).length === 0 && (
                <li className="text-xs text-meta-light">No subcategories yet</li>
              )}
            </ul>
            {addingSubcategoryFor === category.id && (
              <form
                onSubmit={(e) => void handleAddSubcategory(category.id, e)}
                className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2"
              >
                <Input label="Code" name="code" required className="max-w-[160px]" />
                <Input label="Name" name="name" required />
                <Button type="submit">Save</Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RequirementsSection() {
  const handleError = useAdminGuardedError();
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminApiClient
      .listOpenRequirements()
      .then((result) => setRequirements(result!))
      .catch((err) => handleError(err, setError));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!requirements) return <LoadingState label="Loading requirements…" />;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">Open requirements (read-only oversight)</h2>
      <p className="text-xs text-meta-light">
        Every open, not-yet-expired Requirement across every Renter — the same broadcast set a
        Rental Company already discovers. Platform Admin never creates, edits, or closes these.
      </p>
      {requirements.length === 0 ? (
        <EmptyState title="No open requirements right now" />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Project</Th>
              <Th>Requested start</Th>
              <Th>Validity</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {requirements.map((req) => (
              <Tr key={req.id}>
                <Td>{req.projectName ?? "—"}</Td>
                <Td className="font-mono">{formatDate(req.requestedStartDate)}</Td>
                <Td className="font-mono">{formatDate(req.validityDate)}</Td>
                <Td>
                  <Badge tone="info">{req.status}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function AuctionsSection() {
  const handleError = useAdminGuardedError();
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminApiClient
      .listAuctions()
      .then((result) => setAuctions(result!))
      .catch((err) => handleError(err, setError));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!auctions) return <LoadingState label="Loading auctions…" />;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">Auctions (read-only oversight)</h2>
      <p className="text-xs text-meta-light">
        Every auction across every tenant — competitor identity and bid detail stay hidden here too;
        this is status/timing oversight, not a bid-detail view.
      </p>
      {auctions.length === 0 ? (
        <EmptyState title="No auctions yet" />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Direction</Th>
              <Th>Base price</Th>
              <Th>Starts</Th>
              <Th>Ends</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {auctions.map((auction) => (
              <Tr key={auction.id}>
                <Td>{auction.biddingDirection}</Td>
                <Td className="font-mono">{auction.basePrice}</Td>
                <Td className="font-mono">{formatDate(auction.startsAt)}</Td>
                <Td className="font-mono">{formatDate(auction.endsAt)}</Td>
                <Td>
                  <Badge tone={auction.status === "live" ? "success" : "neutral"}>{auction.status}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

const PERMISSION_GROUPS: { label: string; codes: PermissionCode[] }[] = [
  { label: "Organization", codes: ["organization.manage", "membership.manage"] },
  { label: "Equipment", codes: ["equipment.manage"] },
  { label: "Requirements (RFQ)", codes: ["rfq.manage", "rfq.respond"] },
  { label: "Projects", codes: ["project.manage"] },
  { label: "Quotations", codes: ["quotation.manage", "quotation.respond"] },
  { label: "Auctions", codes: ["auction.manage", "auction.participate"] },
  { label: "Rentals", codes: ["rental.manage", "rental.respond"] },
  { label: "Operations", codes: ["maintenance.manage", "transport.manage", "transport.respond", "logsheet.manage", "logsheet.respond"] },
  { label: "Billing", codes: ["billing.manage", "billing.respond"] },
  { label: "Catalogue", codes: ["catalogue.manage"] },
];

function AccessRolesSection() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">Roles → permissions</h2>
      <p className="text-sm text-meta">
        FleetIP&apos;s fixed, static tenant permission list from{" "}
        <code className="rounded-xs bg-surface-sunk px-1 py-0.5 font-mono text-xs">packages/contracts</code>.
        Platform Admin itself has no separate permission tiers yet — any authenticated staff session
        holds the full scope shown across the other tabs (see the staff module).
      </p>
      <div className="flex flex-col gap-3">
        {PERMISSION_GROUPS.map((group) => (
          <Card key={group.label} padding="sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-meta">{group.label}</p>
            <div className="flex flex-col gap-1.5">
              {group.codes.map((code) => (
                <div key={code} className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="rounded-xs bg-surface-sunk px-1.5 py-0.5 font-mono text-xs text-ink">{code}</code>
                  <span className="text-xs text-meta">
                    {PERMISSION_ORGANIZATION_TYPES[code].map((t) => (t === "rental_company" ? "Rental company" : "Renter")).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
