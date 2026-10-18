"use client";

import type { AuthenticatedSession } from "@fleetip/contracts/identity";
import type {
  MembershipWithOrganization,
  OrganizationContactInput,
  OrganizationProfile,
} from "@fleetip/contracts/organization";
import {
  Button,
  DescriptionList,
  Dialog,
  EmptyState,
  FormBanner,
  FormSection,
  Icon,
  Input,
  LoadingState,
  Panel,
  useToast,
} from "@fleetip/ui";
import { useEffect, useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
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
            The code and type are fixed. Add your address, tax, bank and contact details in Company details below.
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
      <div className="min-[1180px]:col-span-2">
        <CompanyDetailsPanel organizationId={organization.id} canEdit={canEdit} online={online} />
      </div>
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

// --- Company details (0040): address, GST/PAN, bank, website, logo, contacts ---

function hasAnyProfileDetail(profile: OrganizationProfile): boolean {
  const { organizationId, contacts, ...fields } = profile;
  void organizationId;
  return contacts.length > 0 || Object.values(fields).some((value) => value != null && value !== "");
}

function joinAddress(profile: OrganizationProfile): string | null {
  const parts = [
    profile.addressLine1,
    profile.addressLine2,
    [profile.city, profile.state, profile.postalCode].filter(Boolean).join(" "),
    profile.country,
  ].filter((part) => part && part.trim());
  return parts.length ? parts.join(", ") : null;
}

function CompanyDetailsPanel({
  organizationId,
  canEdit,
  online,
}: {
  organizationId: string;
  canEdit: boolean;
  online: boolean;
}) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = (await apiClient.getCompanyProfile(organizationId)) as OrganizationProfile;
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) setError(describeError(err, "Company details didn't load").body);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const filled = profile ? hasAnyProfileDetail(profile) : false;

  return (
    <Panel
      title="Company details"
      icon="organization"
      actions={
        canEdit && profile ? (
          <Button
            variant="secondary"
            size="sm"
            icon="edit"
            onClick={() => setEditing(true)}
            disabled={!online}
            title={!online ? OFFLINE_HINT : undefined}
          >
            {filled ? "Edit details" : "Add details"}
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <LoadingState label="Loading company details…" />
      ) : error ? (
        <FormBanner tone="error" title="Company details didn't load">
          {error}
        </FormBanner>
      ) : !profile || !filled ? (
        <EmptyState
          title="No company details yet"
          description={
            canEdit
              ? "Add your address, GST and PAN, bank details, website, logo, and contact people."
              : "An organization admin can add the address, tax, bank and contact details."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DescriptionList
            items={[
              { label: "Address", value: joinAddress(profile) },
              { label: "GST number", value: profile.gstNumber, mono: true },
              { label: "PAN", value: profile.panNumber, mono: true },
              { label: "Website", value: profile.website },
              { label: "Logo URL", value: profile.logoUrl },
            ]}
          />
          {(profile.bankName || profile.bankAccountNumber || profile.bankIfsc) && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">Bank details</span>
              <DescriptionList
                items={[
                  { label: "Bank", value: profile.bankName },
                  { label: "Account name", value: profile.bankAccountName },
                  { label: "Account number", value: profile.bankAccountNumber, mono: true },
                  { label: "IFSC", value: profile.bankIfsc, mono: true },
                  { label: "Branch", value: profile.bankBranch },
                ]}
              />
            </div>
          )}
          {profile.contacts.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">Contact people</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {profile.contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-col gap-0.5 rounded-control border border-border bg-surface-sunk px-3 py-2">
                    <span className="text-sm font-medium text-ink">
                      {contact.name}
                      {contact.designation ? <span className="font-normal text-meta"> · {contact.designation}</span> : null}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No number or email recorded"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {editing && profile && (
        <EditCompanyDetailsDialog
          open
          organizationId={organizationId}
          profile={profile}
          online={online}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setProfile(updated);
            setEditing(false);
          }}
        />
      )}
    </Panel>
  );
}

const companyDetailsSchema = z.object({
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(120).optional(),
  gstNumber: z.string().trim().max(30).optional(),
  panNumber: z.string().trim().max(30).optional(),
  bankName: z.string().trim().max(200).optional(),
  bankAccountName: z.string().trim().max(200).optional(),
  bankAccountNumber: z.string().trim().max(60).optional(),
  bankIfsc: z.string().trim().max(20).optional(),
  bankBranch: z.string().trim().max(200).optional(),
  website: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Enter a full URL starting with http:// or https://")
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Enter a full URL starting with http:// or https://")
    .optional(),
});

type ContactRow = { name: string; designation: string; phone: string; email: string };

function EditCompanyDetailsDialog({
  open,
  organizationId,
  profile,
  online,
  onClose,
  onSaved,
}: {
  open: boolean;
  organizationId: string;
  profile: OrganizationProfile;
  online: boolean;
  onClose: () => void;
  onSaved: (profile: OrganizationProfile) => void;
}) {
  const toast = useToast();
  const form = useForm({
    schema: companyDetailsSchema,
    initial: {
      addressLine1: profile.addressLine1 ?? "",
      addressLine2: profile.addressLine2 ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      postalCode: profile.postalCode ?? "",
      country: profile.country ?? "",
      gstNumber: profile.gstNumber ?? "",
      panNumber: profile.panNumber ?? "",
      bankName: profile.bankName ?? "",
      bankAccountName: profile.bankAccountName ?? "",
      bankAccountNumber: profile.bankAccountNumber ?? "",
      bankIfsc: profile.bankIfsc ?? "",
      bankBranch: profile.bankBranch ?? "",
      website: profile.website ?? "",
      logoUrl: profile.logoUrl ?? "",
    },
    failTitle: "Company details weren't saved",
  });

  const [contacts, setContacts] = useState<ContactRow[]>(
    profile.contacts.length
      ? profile.contacts.map((c) => ({
          name: c.name,
          designation: c.designation ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
        }))
      : [],
  );

  const setContact = (index: number, key: keyof ContactRow, value: string) =>
    setContacts((list) => list.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const addContact = () => setContacts((list) => [...list, { name: "", designation: "", phone: "", email: "" }]);
  const removeContact = (index: number) => setContacts((list) => list.filter((_, i) => i !== index));

  const handleSubmit = form.submit(async (values) => {
    // Only contacts with a name are kept; a blank row is simply dropped.
    const cleanedContacts: OrganizationContactInput[] = contacts
      .filter((c) => c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        designation: c.designation.trim() || undefined,
        phone: c.phone.trim() || undefined,
        email: c.email.trim() || undefined,
      }));
    const updated = (await apiClient.saveCompanyProfile(organizationId, {
      ...values,
      contacts: cleanedContacts,
    })) as OrganizationProfile;
    toast.success({ title: "Company details saved", body: "They now show on your organization settings." });
    onSaved(updated);
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Company details"
      description="Address, tax, bank, website, logo and contact people for your organization."
      icon="edit"
      size="lg"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…" disabled={!online} title={!online ? OFFLINE_HINT : undefined}>
            Save details
          </Button>
        </>
      }
    >
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          Company details can&apos;t be saved until the connection is back.
        </FormBanner>
      )}
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}

      <FormSection title="Address">
        <Input label="Address line 1" maxLength={200} {...form.field("addressLine1")} />
        <Input label="Address line 2" maxLength={200} {...form.field("addressLine2")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="City" maxLength={120} {...form.field("city")} />
          <Input label="State" maxLength={120} {...form.field("state")} />
          <Input label="Postal code" maxLength={20} {...form.field("postalCode")} />
          <Input label="Country" maxLength={120} {...form.field("country")} />
        </div>
      </FormSection>

      <FormSection title="Tax" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="GST number" mono maxLength={30} {...form.field("gstNumber")} />
          <Input label="PAN" mono maxLength={30} {...form.field("panNumber")} />
        </div>
      </FormSection>

      <FormSection title="Bank details" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Bank name" maxLength={200} {...form.field("bankName")} />
          <Input label="Account name" maxLength={200} {...form.field("bankAccountName")} />
          <Input label="Account number" mono maxLength={60} {...form.field("bankAccountNumber")} />
          <Input label="IFSC" mono maxLength={20} {...form.field("bankIfsc")} />
          <Input label="Branch" maxLength={200} {...form.field("bankBranch")} />
        </div>
      </FormSection>

      <FormSection title="Web & logo" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Website" type="url" placeholder="https://example.com" {...form.field("website")} />
          <Input label="Logo URL" type="url" placeholder="https://…/logo.png" {...form.field("logoUrl")} hint="Link to your logo image." />
        </div>
      </FormSection>

      <FormSection
        title="Contact people"
        description="Name, designation and number for the people a customer should reach."
        className="border-t border-border pt-4"
      >
        <div className="flex flex-col gap-3">
          {contacts.map((contact, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-control border border-border bg-surface-sunk p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-meta">Person {index + 1}</span>
                <Button variant="tertiary" size="sm" icon="close" onClick={() => removeContact(index)}>
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Name" maxLength={200} value={contact.name} onChange={(e) => setContact(index, "name", e.target.value)} />
                <Input
                  label="Designation"
                  maxLength={200}
                  value={contact.designation}
                  onChange={(e) => setContact(index, "designation", e.target.value)}
                />
                <Input label="Phone" type="tel" maxLength={60} value={contact.phone} onChange={(e) => setContact(index, "phone", e.target.value)} />
                <Input label="Email" type="email" value={contact.email} onChange={(e) => setContact(index, "email", e.target.value)} />
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" icon="plus" onClick={addContact} className="self-start">
            Add a person
          </Button>
          {contacts.length === 0 && <p className="m-0 text-xs text-meta">No contact people yet. Add one above.</p>}
        </div>
      </FormSection>
    </Dialog>
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
