"use client";

import type { AuthenticatedSession } from "@fleetip/contracts/identity";
import type { MembershipWithOrganization } from "@fleetip/contracts/organization";
import { Button, DescriptionList, Dialog, FormBanner, Icon, Input, Panel, useToast } from "@fleetip/ui";
import { useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import { formatDate } from "../../../lib/format";
import { Status } from "../../../lib/status";
import { ORGANIZATION_TYPE_LABEL } from "./permissions";

// Mirrors updateOrganizationRequestSchema (1–200 chars after trimming).
const schema = z.object({
  name: z.string().trim().min(1, "Enter the organization's name.").max(200, "Keep the name to 200 characters or fewer."),
});

/**
 * Everything shown comes from the signed-in session — no extra request.
 * Only the name is editable (organization.manage): organizations store no
 * contact details or address, and code/type are platform-owned.
 */
export function OrganizationTab({
  membership,
  session,
  canEdit,
  online,
  onSaved,
}: {
  membership: MembershipWithOrganization;
  session: AuthenticatedSession;
  canEdit: boolean;
  online: boolean;
  /** Re-read the session so the header/org switcher show the new name. */
  onSaved: () => void;
}) {
  const { organization } = membership;
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid grid-cols-1 items-start gap-3.5 min-[1180px]:grid-cols-2">
      <Panel
        title="Organization profile"
        icon="organization"
        actions={
          canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              icon="edit"
              onClick={() => setEditing(true)}
              disabled={!online}
              title={!online ? OFFLINE_HINT : undefined}
            >
              Edit name
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3">
          <DescriptionList
            items={[
              { label: "Name", value: organization.name },
              { label: "Organization code", value: organization.code, mono: true },
              { label: "Type", value: ORGANIZATION_TYPE_LABEL[organization.organizationTypeCode] },
              { label: "On FleetIP since", value: formatDate(organization.createdAt), mono: true },
            ]}
          />
          <p className="m-0 flex items-start gap-2 text-xs leading-[1.5] text-ink-soft">
            <Icon name="lock" size={14} className="mt-px text-meta-light" />
            The code and type are fixed. Organizations don&apos;t store contact details or an address.
          </p>
        </div>
      </Panel>

      <Panel title="Your account" icon="user">
        <DescriptionList
          items={[
            { label: "Name", value: session.user.displayName },
            { label: "Email", value: session.user.email },
            { label: "Your role here", value: membership.roleName },
            {
              label: "Membership",
              value: <Status domain="membership" value={membership.status} size="sm" />,
            },
            { label: "Account created", value: formatDate(session.user.createdAt), mono: true },
            {
              label: "Organizations you belong to",
              value: String(session.memberships.length),
              mono: true,
            },
          ]}
        />
      </Panel>
      {editing && (
        <EditOrganizationDialog
          open
          organizationId={organization.id}
          currentName={organization.name}
          online={online}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function EditOrganizationDialog({
  open,
  organizationId,
  currentName,
  online,
  onClose,
  onSaved,
}: {
  open: boolean;
  organizationId: string;
  currentName: string;
  online: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  // Mounted only while open, so it starts from the current name each time.
  const form = useForm({ schema, initial: { name: currentName }, failTitle: "The name wasn't saved" });

  const handleSubmit = form.submit(async ({ name }) => {
    if (name === currentName) return onClose();
    await apiClient.updateOrganizationProfile(organizationId, { name });
    toast.success({ title: "Organization renamed", body: `It now shows as ${name} everywhere in FleetIP.` });
    onSaved();
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit organization name"
      description="Everyone in your organization, and the organizations you trade with, see the new name straight away."
      icon="edit"
      size="md"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…" disabled={!online} title={!online ? OFFLINE_HINT : undefined}>
            Save name
          </Button>
        </>
      }
    >
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          The name can&apos;t be saved until the connection is back.
        </FormBanner>
      )}
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <Input
        label="Organization name"
        required
        maxLength={200}
        {...form.field("name")}
        data-autofocus=""
      />
    </Dialog>
  );
}
