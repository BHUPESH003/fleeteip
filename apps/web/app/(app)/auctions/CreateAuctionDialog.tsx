"use client";

import { BiddingDirection, type Auction, type CreateAuctionRequest } from "@fleetip/contracts/auction";
import type { Requirement } from "@fleetip/contracts/rfq";
import { Button, Dialog, FormBanner, Input, RadioGroup, SearchSelect, useToast } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { formatDateTime, formatMoney } from "../../../lib/format";
import { useForm } from "../../../lib/form";
import { requirementRef } from "../requirements/shared";
import { DIRECTION, auctionRef } from "./shared";

export interface CreateAuctionDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Fixed requirement id (from the requirement or its auction page). */
  requirementId: string | null;
  /** Otherwise a picker over these (open requirements only — the API refuses others). */
  requirements?: { requirement: Requirement; label: string }[] | null;
  /** Shown under the fixed requirement ("Crawler crane · 50 t"). */
  requirementLabel?: string | null;
  onCreated: (auction: Auction) => void;
}

type Key = "requirementId" | "biddingDirection" | "basePrice" | "maxBidsPerParticipant" | "startsAt" | "endsAt";
type Values = Record<Key, string>;

/** "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initialValues(requirementId: string | null): Values {
  return {
    requirementId: requirementId ?? "",
    biddingDirection: "",
    basePrice: "",
    maxBidsPerParticipant: "",
    startsAt: localInputValue(new Date(Date.now() + 60 * 60_000)),
    endsAt: "",
  };
}

const validTime = (raw: string) => Boolean(raw) && !Number.isNaN(new Date(raw).getTime());

/**
 * Mirrors createAuctionRequestSchema: a direction, a base price above 0, an
 * optional whole-number bid limit above 0, and an end after the start. No
 * "not in the past" rule for the start on purpose — an auction that starts
 * immediately is a real case (docs/decisions.md) — so a past start only
 * warns.
 */
const createAuctionSchema = z
  .object({
    requirementId: z.string().min(1, "Choose the open requirement the auction is for."),
    biddingDirection: z.string().min(1, "Choose how bids compete."),
    basePrice: z
      .string()
      .trim()
      .min(1, "Enter the base price.")
      .refine((raw) => Number(raw) > 0, "Enter a base price above ₹0."),
    maxBidsPerParticipant: z.string().refine((raw) => {
      if (!raw.trim()) return true;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 1;
    }, "Enter a whole number of bids, 1 or more, or leave it empty for no limit."),
    startsAt: z.string().refine(validTime, "Pick when bidding opens."),
    endsAt: z.string().refine(validTime, "Pick when bidding closes."),
  })
  .refine((values) => !validTime(values.startsAt) || !validTime(values.endsAt) || new Date(values.endsAt) > new Date(values.startsAt), {
    message: "The end must be after the start.",
    path: ["endsAt"],
  })
  .transform((values): { requirementId: string; body: Omit<CreateAuctionRequest, "requirementId"> } => ({
    requirementId: values.requirementId,
    body: {
      biddingDirection: values.biddingDirection as BiddingDirection,
      basePrice: Number(values.basePrice),
      maxBidsPerParticipant: values.maxBidsPerParticipant.trim() ? Number(values.maxBidsPerParticipant) : undefined,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
    },
  }));

export function CreateAuctionDialog({ open, onClose, organizationId, requirementId, requirements, requirementLabel, onCreated }: CreateAuctionDialogProps) {
  const toast = useToast();
  const router = useRouter();
  const form = useForm({
    schema: createAuctionSchema,
    initial: initialValues(requirementId),
    failTitle: "The auction wasn't created",
    // "Cannot run an auction against a requirement that is not open"
    conflicts: { requirementId: "This requirement isn't open any more, so it can't be auctioned." },
  });
  const { values, busy, online, reset } = form;

  useEffect(() => {
    if (open) reset(initialValues(requirementId));
  }, [open, requirementId, reset]);

  const direction = values.biddingDirection as BiddingDirection | "";
  const startsAtWarning =
    validTime(values.startsAt) && new Date(values.startsAt).getTime() < Date.now()
      ? "This time has passed — the auction goes live as soon as it's created."
      : undefined;
  const bind = form.field;

  const handleSubmit = form.submit(async ({ requirementId: id, body }) => {
    const auction = (await apiClient.createAuction(organizationId, id, body)) as Auction;
    toast.success({
      title: `Auction ${auctionRef(auction.id)} created`,
      body: `${DIRECTION[auction.biddingDirection].rule}, base ${formatMoney(auction.basePrice)}. ${
        new Date(auction.startsAt).getTime() <= Date.now() ? "Bidding is open now." : `Bidding opens ${formatDateTime(auction.startsAt)}.`
      }`,
      action: {
        label: "Open",
        onClick: () => router.push(`/auctions?requirementId=${auction.requirementId}&auctionId=${auction.id}`),
      },
    });
    onCreated(auction);
    onClose();
  });

  const options = (requirements ?? []).map(({ requirement: r, label }) => ({
    value: r.id,
    label: requirementRef(r.id),
    description: [label, r.projectName].filter(Boolean).join(" · "),
    keywords: r.projectLocation ?? undefined,
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={requirementId ? `Start an auction for ${requirementRef(requirementId)}` : "Start an auction"}
      description="Approved rental companies bid within the window. Closing it doesn't award anything — you pick who to proceed with."
      icon="auction"
      tone="info"
      size="md"
      dismissible={!busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} busyLabel="Creating…" disabled={!online} title={!online ? OFFLINE_HINT : undefined}>
            Create auction
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <div data-field="requirementId">
        {requirementId ? (
          <Input label="Requirement" value={`${requirementRef(requirementId)}${requirementLabel ? ` · ${requirementLabel}` : ""}`} readOnly disabled error={form.errors.requirementId} />
        ) : (
          <SearchSelect
            label="Requirement"
            name="requirementId"
            required
            options={options}
            loading={requirements === undefined}
            value={values.requirementId}
            onChange={(value) => form.set("requirementId", value)}
            onBlur={bind("requirementId").onBlur}
            placeholder="Search your open requirements"
            emptyText={requirements === null ? "Listing requirements needs the Requirements permission." : "No open requirement matches."}
            error={form.errors.requirementId}
            hint="Only open requirements can be auctioned."
          />
        )}
      </div>
      <RadioGroup
        label="Bidding"
        required
        name="auction-direction"
        value={values.biddingDirection}
        onChange={(value) => form.set("biddingDirection", value)}
        error={form.errors.biddingDirection}
        direction="column"
        options={[
          { value: BiddingDirection.descending, label: "Lowest bid leads", description: "Descending. Bids go down from the base price — usual when you're hiring equipment." },
          { value: BiddingDirection.ascending, label: "Highest bid leads", description: "Ascending. Bids go up from the base price." },
        ]}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div data-field="basePrice">
          <Input
            label={direction === BiddingDirection.descending ? "Ceiling price" : direction === BiddingDirection.ascending ? "Starting price" : "Base price"}
            required
            prefix="₹"
            mono
            inputMode="decimal"
            {...bind("basePrice")}
            hint={
              direction === BiddingDirection.descending
                ? "Bids must be this or lower."
                : direction === BiddingDirection.ascending
                  ? "Bids must be this or higher."
                  : "The first bid is measured against it."
            }
          />
        </div>
        <div data-field="maxBidsPerParticipant">
          <Input label="Bids per company" mono inputMode="numeric" {...bind("maxBidsPerParticipant")} hint="Leave empty for no limit." />
        </div>
        <div data-field="startsAt">
          <Input label="Bidding opens" required type="datetime-local" mono {...bind("startsAt")} warning={startsAtWarning} hint="Your local time." />
        </div>
        <div data-field="endsAt">
          <Input label="Bidding closes" required type="datetime-local" mono min={values.startsAt || undefined} {...bind("endsAt")} hint="After the opening time." />
        </div>
      </div>
    </Dialog>
  );
}
