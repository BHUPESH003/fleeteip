"use client";

import type { CreateQuotationScopeItemRequest, QuotationScopeItem, ResponsibleParty } from "@fleetip/contracts/quotation";
import {
  Button,
  EmptyState,
  FormBanner,
  IconButton,
  Input,
  Panel,
  Select,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "@fleetip/ui";
import { useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../../lib/api-client";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { useAction, useForm } from "../../../../lib/form";
import { RESPONSIBLE_PARTY_LABEL, RESPONSIBLE_PARTY_OPTIONS } from "../shared";

const EMPTY = { item: "", responsibleParty: "", notes: "" };

const scopeItemSchema = z
  .object({
    item: z
      .string()
      .trim()
      .min(1, "Name the responsibility, e.g. Wire rope or Ground preparation.")
      .max(200, "Items are up to 200 characters."),
    responsibleParty: z.string().min(1, "Choose whose scope it is."),
    notes: z.string().trim().max(500, "Notes are up to 500 characters."),
  })
  .transform(
    (values): CreateQuotationScopeItemRequest => ({
      item: values.item,
      responsibleParty: values.responsibleParty as ResponsibleParty,
      notes: values.notes || undefined,
    }),
  );

/**
 * Category/equipment-specific responsibilities (wire rope scope, ground
 * preparation, support crane, ...) — a structured collection rather than an
 * ever-growing set of *Scope columns. Only the drafting Rental Company can
 * add/remove while the quotation is draft/sent/negotiating; either party
 * reads. Scope items are copied onto the work order at award. Removing one
 * offers Undo (the reverse call — add it again — exists).
 */
export function ScopeItemsCard({
  organizationId,
  quotationId,
  reference,
  items,
  canEdit,
  lockedReason,
  onChange,
}: {
  organizationId: string;
  quotationId: string;
  reference: string;
  /** null when the list didn't load. */
  items: QuotationScopeItem[] | null;
  canEdit: boolean;
  /** Why editing isn't possible (shown to the owner). */
  lockedReason: string | null;
  /** Receives an updater so overlapping removes/undos never work from a stale list. */
  onChange: (update: (items: QuotationScopeItem[]) => QuotationScopeItem[]) => void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const form = useForm({ schema: scopeItemSchema, initial: EMPTY, failTitle: "The item wasn't added" });
  const { busy, online } = form;

  const add = form.submit(async (body) => {
    const created = (await apiClient.addScopeItem(organizationId, quotationId, body)) as QuotationScopeItem;
    onChange((current) => [...current, created]);
    toast.success({
      title: `Scope item added to ${reference}`,
      body: `${created.item} — ${RESPONSIBLE_PARTY_LABEL[created.responsibleParty]}.`,
    });
    form.reset(EMPTY);
    setAdding(false);
  });

  // ponytail: one undo action per card; a second Undo clicked while one is in flight is ignored.
  const undoAction = useAction();
  const undo = (item: QuotationScopeItem) =>
    undoAction.run(
      () =>
        apiClient.addScopeItem(organizationId, quotationId, {
          item: item.item,
          responsibleParty: item.responsibleParty,
          notes: item.notes ?? undefined,
        }) as Promise<QuotationScopeItem>,
      {
        failTitle: "Couldn't undo",
        report: "toast",
        onDone: (restored) => {
          onChange((current) => [...current, restored]);
          toast.info({ title: "Undone", body: `“${item.item}” is back on ${reference}.` });
        },
      },
    );

  const bind = form.field;

  return (
    <Panel
      title="Scope and responsibilities"
      count={items?.length}
      subtitle="copied onto the work order at award"
      padding="none"
      actions={
        canEdit && !adding ? (
          <Button size="sm" variant="secondary" icon="plus" onClick={() => setAdding(true)} disabled={!online} title={!online ? OFFLINE_HINT : undefined}>
            Add item
          </Button>
        ) : undefined
      }
    >
      {items === null ? (
        <EmptyState title="Scope items didn't load" description="Reload the page to try again." />
      ) : items.length === 0 && !adding ? (
        <EmptyState
          title="No scope items"
          description={
            canEdit
              ? "Record who handles equipment-specific duties — wire rope, ground preparation, a support crane."
              : lockedReason ?? "No equipment-specific responsibilities were recorded."
          }
        />
      ) : items.length > 0 ? (
        <Table bare minWidth={560} caption={`Scope items on ${reference}`}>
          <Thead>
            <Tr>
              <Th>Item</Th>
              <Th className="w-[200px]">Whose scope</Th>
              <Th>Notes</Th>
              {canEdit && (
                <Th className="w-[60px]">
                  <span className="sr-only">Remove</span>
                </Th>
              )}
            </Tr>
          </Thead>
          <Tbody>
            {items.map((item) => (
              <Tr key={item.id}>
                <Td className="font-medium">{item.item}</Td>
                <Td className="text-xs">{RESPONSIBLE_PARTY_LABEL[item.responsibleParty]}</Td>
                <Td className="text-xs text-ink-muted">
                  <span className="clamp-2" title={item.notes ?? undefined}>
                    {item.notes ?? <span className="italic text-disabled-text">No notes</span>}
                  </span>
                </Td>
                {canEdit && (
                  <Td>
                    <RemoveScopeItemButton
                      organizationId={organizationId}
                      quotationId={quotationId}
                      reference={reference}
                      item={item}
                      online={online}
                      onRemoved={() => onChange((current) => current.filter((i) => i.id !== item.id))}
                      onUndo={() => void undo(item)}
                    />
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}
      {adding && (
        <form noValidate onSubmit={add} className="flex flex-col gap-3 border-t border-border px-4 py-3.5">
          {form.banner && (
            <FormBanner tone="error" title="The item wasn't added">
              {form.banner.body}
            </FormBanner>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div data-scope-field="item">
              <Input label="Item" required maxLength={220} placeholder="e.g. Wire rope" {...bind("item")} />
            </div>
            <div data-scope-field="responsibleParty">
              <Select label="Whose scope" required placeholder="Choose" options={RESPONSIBLE_PARTY_OPTIONS} {...bind("responsibleParty")} />
            </div>
          </div>
          <div data-scope-field="notes">
            <Input label="Notes" maxLength={520} {...bind("notes")} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setAdding(false);
                form.reset(form.values);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" busy={busy} busyLabel="Adding…" disabled={!online}>
              Add item
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

/** Per-row remove, so each row keeps its own busy state; the success toast offers Undo. */
function RemoveScopeItemButton({
  organizationId,
  quotationId,
  reference,
  item,
  online,
  onRemoved,
  onUndo,
}: {
  organizationId: string;
  quotationId: string;
  reference: string;
  item: QuotationScopeItem;
  online: boolean;
  onRemoved: () => void;
  onUndo: () => void;
}) {
  const action = useAction();
  return (
    <IconButton
      icon="close"
      label={`Remove ${item.item}`}
      variant="ghost"
      size="sm"
      disabled={!online || action.busy}
      onClick={() =>
        void action.run(() => apiClient.removeScopeItem(organizationId, quotationId, item.id), {
          failTitle: `Couldn't remove “${item.item}”`,
          report: "toast",
          success: () => ({ title: `Removed “${item.item}” from ${reference}`, body: "It won't be copied onto the work order.", undo: onUndo }),
          onDone: onRemoved,
        })
      }
      tooltipSide="left"
    />
  );
}
