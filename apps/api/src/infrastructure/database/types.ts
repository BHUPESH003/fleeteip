import type { ColumnType, Generated } from "kysely";

/** A required timestamp with no DB default (e.g. sessions.expires_at). */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** A DB-defaulted, never-updated timestamp (every table's created_at). */
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;

/**
 * A DB-defaulted timestamp the app must explicitly bump on every update —
 * no trigger exists for this yet, so the update type is required (not
 * optional) on purpose: it's a compile-time reminder that every
 * `.updateTable(...)` call touching this column must set it itself.
 */
type UpdatedAt = ColumnType<Date, Date | string | undefined, Date | string>;

export interface OrganizationTypesTable {
  id: Generated<string>;
  code: string;
  name: string;
  created_at: CreatedAt;
}

export interface OrganizationsTable {
  id: Generated<string>;
  organization_type_id: string;
  name: string;
  code: string;
  created_at: CreatedAt;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: CreatedAt;
}

export interface RolesTable {
  id: Generated<string>;
  name: string;
  created_at: CreatedAt;
}

export interface PermissionsTable {
  id: Generated<string>;
  code: string;
  created_at: CreatedAt;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
}

export interface MembershipsTable {
  id: Generated<string>;
  user_id: string;
  organization_id: string;
  role_id: string;
  status: string;
  created_at: CreatedAt;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: CreatedAt;
}

export interface Database {
  organization_types: OrganizationTypesTable;
  organizations: OrganizationsTable;
  users: UsersTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  memberships: MembershipsTable;
  sessions: SessionsTable;
  product_categories: ProductCategoriesTable;
  product_subcategories: ProductSubcategoriesTable;
  products: ProductsTable;
  machines: MachinesTable;
  rentals: RentalsTable;
}

export interface ProductCategoriesTable {
  id: Generated<string>;
  code: string;
  name: string;
  created_at: CreatedAt;
}

export interface ProductSubcategoriesTable {
  id: Generated<string>;
  product_category_id: string;
  code: string;
  name: string;
  created_at: CreatedAt;
}

export interface ProductsTable {
  id: Generated<string>;
  product_subcategory_id: string;
  manufacturer: string;
  name: string;
  capacity: number | null;
  capacity_unit: string | null;
  specifications: unknown | null;
  created_at: CreatedAt;
}

export interface MachinesTable {
  id: Generated<string>;
  organization_id: string;
  product_id: string;
  asset_code: string;
  chassis_number: string | null;
  registration_number: string;
  year_of_manufacture: number | null;
  status: string;
  created_at: CreatedAt;
}

export interface RentalsTable {
  id: Generated<string>;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  client_snapshot: unknown | null;
  machine_id: string;
  status: string;
  project_name: string | null;
  project_location: string | null;
  // Plain "YYYY-MM-DD" strings — see the DATE OID type parser in client.ts.
  start_date: string;
  end_date: string | null;
  rate: number;
  rate_unit: string;
  mobilization_charge: number | null;
  demobilization_charge: number | null;
  payment_terms: string | null;
  shift_structure: string | null;
  overtime_rate: number | null;
  sunday_condition: string | null;
  fuel_norms: string | null;
  operator_scope: string | null;
  notice_period_days: number | null;
  dehire_terms: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  // commitment_range (generated, daterange) intentionally omitted — the app
  // never selects it through Kysely's typed builder; the availability query
  // reaches it via a raw sql template instead.
}
