"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import {
  Button,
  DescriptionList,
  Icon,
  IdentityTile,
  Menu,
  PageHeader,
  UILink,
  type IconName,
  type MenuItem,
} from "@fleetip/ui";
import { categoryIcon } from "../../../../lib/category-icon";
import { Status, type Deployment } from "../../../../lib/status";
import { boomLength, capacityLabel, productName } from "../shared";

export interface HeaderAction {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export function MachineHeader({
  machine,
  product,
  subcategory,
  category,
  deployment,
  ownerName,
  backHref,
  primary,
  quote,
  menuItems,
}: {
  machine: Machine;
  product: Product | null;
  subcategory: ProductSubcategory | null;
  category: ProductCategory | null;
  deployment: Deployment | null;
  ownerName: string;
  backHref: string;
  primary: HeaderAction | null;
  /** null when the role can't quote. */
  quote: { href: string; enabled: boolean; reason: string } | null;
  menuItems: MenuItem[];
}) {
  const icon = categoryIcon(category);
  const boom = boomLength(product);
  const detailParts = [
    subcategory?.name ?? category?.name,
    capacityLabel(product),
    boom ? `${boom} m boom` : null,
  ].filter(Boolean);

  return (
    <PageHeader
      breadcrumbs={[
        { label: "Machines", href: backHref },
        { label: machine.assetCode, mono: true },
      ]}
      note="Filters on the machines list are kept when you go back"
      leading={
        <IdentityTile title={`Category: ${category?.name ?? "Not specified"}`}>
          <Icon name={icon} size={28} strokeWidth={1.3} label={category?.name ?? "Machine"} />
        </IdentityTile>
      }
      title={machine.assetCode}
      titleMono
      meta={
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[11px] leading-none text-meta-light">Machine status</span>
            <Status domain="machine" value={machine.status} />
          </span>
          {deployment && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[11px] leading-none text-meta-light">Right now</span>
              <Status domain="deployment" value={deployment} />
            </span>
          )}
        </>
      }
      description={
        <span className="text-base font-medium leading-[1.3] text-ink-strong">
          {productName(product) ?? "Catalogue product not found"}
          {detailParts.length > 0 && <span className="font-normal text-meta"> · {detailParts.join(" · ")}</span>}
        </span>
      }
      actions={
        <>
          {quote &&
            (quote.enabled ? (
              <UILink
                href={quote.href}
                title="Start a quotation with this machine"
                className="inline-flex h-[34px] items-center gap-[7px] rounded-control border border-border-control bg-surface px-[13px] text-sm font-medium text-ink-strong no-underline hover:bg-surface-hover"
              >
                <Icon name="quotation" size={15} />
                Quote this machine
              </UILink>
            ) : (
              <Button variant="secondary" icon="quotation" disabled title={quote.reason}>
                Quote this machine
              </Button>
            ))}
          {primary && (
            <Button icon={primary.icon} onClick={primary.onClick} disabled={primary.disabled} title={primary.title}>
              {primary.label}
            </Button>
          )}
          {menuItems.length > 0 && <Menu label={`More actions for ${machine.assetCode}`} items={menuItems} width={320} />}
        </>
      }
    >
      <DescriptionList
        layout="inline"
        items={[
          { label: "Registration", value: machine.registrationNumber, mono: true },
          { label: "Chassis", value: machine.chassisNumber, mono: true },
          { label: "Year built", value: machine.yearOfManufacture ? String(machine.yearOfManufacture) : null, mono: true },
          { label: "Owned by", value: ownerName },
        ]}
      />
    </PageHeader>
  );
}
