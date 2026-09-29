"use client";

import { Button, Dropdown, PageError, UILink } from "@fleetip/ui";
import type { ReactNode } from "react";
import { errorStatus } from "../lib/errors";
import { useSession } from "../lib/session-context";
import { useSwitchOrganization } from "./OrganizationSwitcher";

const LINK_PRIMARY =
  "inline-flex h-[34px] items-center rounded-control bg-accent px-[15px] text-sm font-semibold text-white no-underline hover:bg-accent-press";
const LINK_SECONDARY =
  "inline-flex h-[34px] items-center rounded-control border border-border-control bg-surface px-[13px] text-sm font-medium text-ink-strong no-underline hover:bg-surface-hover";

function SwitchOrganizationButton() {
  const { session, currentOrganizationId } = useSession();
  const switchTo = useSwitchOrganization();
  const memberships = session?.memberships ?? [];
  if (memberships.length < 2) return null;
  return (
    <Dropdown
      align="left"
      triggerLabel="Switch organization"
      triggerClassName={LINK_SECONDARY}
      trigger={<span>Switch organization</span>}
      panelClassName="w-64"
    >
      {memberships.map((membership) => (
        <button
          key={membership.id}
          type="button"
          disabled={membership.organizationId === currentOrganizationId}
          onClick={() => switchTo(membership.organizationId)}
          className="block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-page disabled:text-disabled-text"
        >
          {membership.organization.name}
        </button>
      ))}
    </Dropdown>
  );
}

/** 403: say which permission is missing and who can grant it. */
export function ForbiddenPage({
  what,
  permissionHint,
}: {
  /** "machines", "billing" */
  what: string;
  /** "Viewing fleet records needs the Equipment permission." */
  permissionHint: string;
}) {
  const { currentMembership } = useSession();
  return (
    <PageError
      code="403 · No access"
      title={`You don't have access to ${what}${currentMembership ? ` at ${currentMembership.organization.name}` : ""}`}
      body={`${permissionHint} Ask an organization admin to add it to your role.`}
      primary={
        <UILink href="/" className={LINK_PRIMARY}>
          Back to dashboard
        </UILink>
      }
      secondary={<SwitchOrganizationButton />}
    />
  );
}

/** 404: records are never deleted, so it's usually another organization's or a wrong link. */
export function NotFoundPage({
  title,
  body,
  backHref,
  backLabel,
}: {
  title: string;
  body: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <PageError
      code="404 · Not found"
      title={title}
      body={body}
      primary={
        <UILink href={backHref} className={LINK_PRIMARY}>
          {backLabel}
        </UILink>
      }
      secondary={<SwitchOrganizationButton />}
    />
  );
}

/** 500 / network: the problem is on our side; one next step. */
export function ServerErrorPage({
  title,
  onRetry,
  backHref,
  backLabel,
  network,
}: {
  title: string;
  onRetry: () => void;
  backHref?: string;
  backLabel?: string;
  network?: boolean;
}) {
  return (
    <PageError
      code={network ? "Offline · No connection" : "500 · Something went wrong"}
      title={title}
      body={
        network
          ? "FleetIP couldn't be reached. Check your connection; the page will load as soon as it's back."
          : "The problem is on our side, not with your data. Try again in a minute; if it keeps happening, contact support."
      }
      primary={<Button onClick={onRetry}>Try again</Button>}
      secondary={
        backHref ? (
          <UILink href={backHref} className={LINK_SECONDARY}>
            {backLabel ?? "Back"}
          </UILink>
        ) : undefined
      }
    />
  );
}

/**
 * Maps a page-load error to the right full-page state. `notFound` and
 * `forbidden` carry the page's own copy.
 */
export function PageLoadError({
  error,
  onRetry,
  notFound,
  forbidden,
  serverTitle,
  backHref,
  backLabel,
}: {
  error: unknown;
  onRetry: () => void;
  notFound: { title: string; body: string };
  forbidden: { what: string; permissionHint: string };
  serverTitle: string;
  backHref: string;
  backLabel: string;
}): ReactNode {
  const status = errorStatus(error);
  if (status === 404) return <NotFoundPage {...notFound} backHref={backHref} backLabel={backLabel} />;
  if (status === 403) return <ForbiddenPage {...forbidden} />;
  return (
    <ServerErrorPage title={serverTitle} onRetry={onRetry} backHref={backHref} backLabel={backLabel} network={status === 0} />
  );
}
