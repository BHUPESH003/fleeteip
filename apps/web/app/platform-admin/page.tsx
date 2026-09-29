"use client";

import { Button, ErrorState, LoadingState, PageBody, PageHeader, TabPanel, Tabs } from "@fleetip/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { adminApiClient } from "../../lib/admin-api-client";
import { errorStatus } from "../../lib/errors";
import { useLoad } from "../../lib/use-load";
import { OrganizationsSection, UsersSection } from "./AccountsSections";
import { CatalogueSection } from "./CatalogueSection";
import { AccessSection, AuctionsSection, OverviewSection, RequirementsSection } from "./OversightSections";
import { STAFF_LOGIN, isSignedOut, staffCall } from "./staff-api";

/**
 * FleetIP Platform Admin — backed by real /admin/* endpoints, gated by a
 * real staff session (apps/api/src/modules/staff, platform-admin). Scope
 * is deliberately narrow, per the validated business decision: catalogue/
 * reference-data management, list/suspend organizations & users, and
 * read-only cross-tenant visibility into requirements/auctions. No
 * mutation of a tenant's own business records exists here or server-side.
 *
 * Visually distinct from the tenant shell on purpose (dark operational
 * band over the light surface-page) — a different persona, not a mode
 * within the tenant app — reusing the same design tokens rather than
 * inventing a new palette. Never linked from the tenant Sidebar/MobileNav.
 */

type Section = "overview" | "organizations" | "users" | "catalogue" | "requirements" | "auctions" | "access";

const SECTIONS: Array<{ key: Section; label: string; description: string }> = [
  { key: "overview", label: "Overview", description: "Platform-wide counts, worked out when the page opens." },
  { key: "organizations", label: "Organizations", description: "Every tenant organization. Suspend one to stop all of its members' access." },
  { key: "users", label: "Users", description: "Everyone with a FleetIP login. Suspend a user to stop them signing in." },
  { key: "catalogue", label: "Catalogue", description: "The shared product catalogue every rental company registers machines against." },
  { key: "requirements", label: "Requirements", description: "Read-only oversight of open requirements across every renter." },
  { key: "auctions", label: "Auctions", description: "Read-only oversight of auction status and timing." },
  { key: "access", label: "Access and roles", description: "Who can do what here, and the tenant permission list." },
];

// useSearchParams needs a Suspense boundary above it for static rendering.
export default function PlatformAdminPage() {
  return (
    <Suspense fallback={<StaffFrame>{null}</StaffFrame>}>
      <PlatformAdmin />
    </Suspense>
  );
}

function PlatformAdmin() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const me = useLoad(() => staffCall(() => adminApiClient.me()), []);
  const [signingOut, setSigningOut] = useState(false);

  // No staff session (never signed in, or it expired): straight to staff sign-in.
  useEffect(() => {
    if (isSignedOut(me.error)) router.replace(STAFF_LOGIN);
  }, [me.error, router]);

  // ?section= is read from the URL every render, so Back and shared links restore it.
  const sectionParam = searchParams.get("section") ?? "overview";
  const section = SECTIONS.find((s) => s.key === sectionParam) ?? SECTIONS[0]!;

  async function signOut() {
    setSigningOut(true);
    try {
      await staffCall(() => adminApiClient.logout());
    } catch {
      // The session cookie is cleared server-side on logout; nothing more to do on failure.
    }
    router.replace(STAFF_LOGIN);
  }

  if (me.error && isSignedOut(me.error)) {
    return (
      <StaffFrame>
        <LoadingState label="Taking you to staff sign-in…" />
      </StaffFrame>
    );
  }
  if (me.error) {
    const offline = errorStatus(me.error) === 0;
    return (
      <StaffFrame>
        <PageBody>
          <div className="mx-auto w-full max-w-[640px] pt-12">
          <ErrorState
            title={offline ? "FleetIP couldn't be reached" : "Your staff session couldn't be checked"}
            message={
              offline
                ? "Check your connection, then try again."
                : "The problem is on our side, not with your account. Try again in a minute."
            }
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void me.reload()}>
                Try again
              </Button>
            }
          />
          </div>
        </PageBody>
      </StaffFrame>
    );
  }
  if (me.loading || !me.data) {
    return (
      <StaffFrame>
        <LoadingState label="Checking your staff session…" />
      </StaffFrame>
    );
  }

  const staff = me.data.staffUser;
  return (
    <StaffFrame
      account={
        <>
          <span className="hidden min-w-0 flex-col text-right min-[760px]:flex">
            <span className="truncate text-xs font-medium text-white">{staff.displayName}</span>
            <span className="truncate text-[11px] text-rail-tag">{staff.email}</span>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="h-7 flex-none rounded-cell border border-rail-control-border bg-transparent px-2.5 text-xs font-semibold text-white hover:bg-rail-active disabled:text-rail-tag focus-visible:!outline-focus-on-dark"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </>
      }
    >
      <PageHeader title="Platform admin" description={section.description} />
      <PageBody>
        <Tabs
          label="Platform admin sections"
          idBase="staff"
          items={SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
          active={section.key}
          onChange={(key) => router.replace(key === "overview" ? pathname : `${pathname}?section=${key}`, { scroll: false })}
        />
        <TabPanel idBase="staff" tabKey={section.key} className="flex flex-col gap-3.5">
          {section.key === "overview" && <OverviewSection />}
          {section.key === "organizations" && <OrganizationsSection />}
          {section.key === "users" && <UsersSection />}
          {section.key === "catalogue" && <CatalogueSection />}
          {section.key === "requirements" && <RequirementsSection />}
          {section.key === "auctions" && <AuctionsSection />}
          {section.key === "access" && <AccessSection />}
        </TabPanel>
      </PageBody>
    </StaffFrame>
  );
}

/** Staff-only chrome: dark band with the wordmark and the staff account, outside the tenant shell. */
function StaffFrame({ children, account }: { children: ReactNode; account?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <header className="flex h-12 flex-none items-center gap-2.5 bg-rail px-4 min-[760px]:px-6">
        <span aria-hidden="true" className="h-[22px] w-[22px] flex-none rounded-cell bg-accent" />
        <span className="text-sm font-bold text-white">FleetIP</span>
        <span className="truncate text-xs text-rail-tag">· Platform admin · staff only</span>
        {account && <div className="ml-auto flex min-w-0 items-center gap-3">{account}</div>}
      </header>
      <main id="main" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
