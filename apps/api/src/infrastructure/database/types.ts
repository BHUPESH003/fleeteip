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
  status: Generated<string>;
  created_at: CreatedAt;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  display_name: string;
  status: Generated<string>;
  created_at: CreatedAt;
}

export interface StaffUsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: CreatedAt;
}

export interface StaffSessionsTable {
  id: Generated<string>;
  staff_user_id: string;
  token_hash: string;
  expires_at: Timestamp;
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

export interface OrganizationInvitesTable {
  id: Generated<string>;
  organization_id: string;
  role_id: string;
  token_hash: string;
  invited_by_user_id: string | null;
  status: string;
  expires_at: Timestamp;
  accepted_by_user_id: string | null;
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
  requirements: RequirementsTable;
  auctions: AuctionsTable;
  auction_participants: AuctionParticipantsTable;
  auction_bids: AuctionBidsTable;
  auction_events: AuctionEventsTable;
  auction_results: AuctionResultsTable;
  quotation_responses: QuotationResponsesTable;
  quotation_reference_sequences: QuotationReferenceSequencesTable;
  commercial_quotations: CommercialQuotationsTable;
  quotation_offers: QuotationOffersTable;
  quotation_scope_items: QuotationScopeItemsTable;
  work_orders: WorkOrdersTable;
  work_order_scope_items: WorkOrderScopeItemsTable;
  work_order_reference_sequences: WorkOrderReferenceSequencesTable;
  staff_users: StaffUsersTable;
  staff_sessions: StaffSessionsTable;
  organization_invites: OrganizationInvitesTable;
  maintenance_records: MaintenanceRecordsTable;
  transport_records: TransportRecordsTable;
  logsheets: LogsheetsTable;
  invoices: InvoicesTable;
  invoice_line_items: InvoiceLineItemsTable;
  payments: PaymentsTable;
  invoice_reference_sequences: InvoiceReferenceSequencesTable;
  notifications: NotificationsTable;
  projects: ProjectsTable;
  project_reference_sequences: ProjectReferenceSequencesTable;
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

export interface ProjectsTable {
  id: Generated<string>;
  renter_organization_id: string;
  project_code: string;
  project_type: string;
  project_name: string;
  site_location: string;
  state: string | null;
  district: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface ProjectReferenceSequencesTable {
  organization_id: string;
  next_value: Generated<number>;
}

export interface RequirementsTable {
  id: Generated<string>;
  renter_organization_id: string;
  project_id: string;
  product_subcategory_id: string;
  capacity: number | null;
  capacity_unit: string | null;
  boom_length: number | null;
  quantity: number;
  project_name: string | null;
  project_location: string | null;
  requested_start_date: string;
  expected_duration_value: number | null;
  expected_duration_unit: string | null;
  shift_pattern: string | null;
  crew_requirement: string | null;
  shift_requirement: string | null;
  validity_date: string;
  status: string;
  notes: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface AuctionsTable {
  id: Generated<string>;
  requirement_id: string;
  created_by_organization_id: string;
  bidding_direction: string;
  base_price: number;
  max_bids_per_participant: number | null;
  starts_at: Timestamp;
  ends_at: Timestamp;
  status: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface AuctionParticipantsTable {
  id: Generated<string>;
  auction_id: string;
  rental_company_organization_id: string;
  status: string;
  created_at: CreatedAt;
}

export interface AuctionBidsTable {
  id: Generated<string>;
  auction_id: string;
  participant_id: string;
  amount: number;
  created_at: CreatedAt;
}

export interface AuctionEventsTable {
  id: Generated<string>;
  auction_id: string;
  event_type: string;
  actor_organization_id: string | null;
  payload: unknown | null;
  created_at: CreatedAt;
}

export interface AuctionResultsTable {
  auction_id: string;
  winning_bid_id: string | null;
  winning_amount: number | null;
  closed_at: CreatedAt;
}

export interface QuotationResponsesTable {
  id: Generated<string>;
  requirement_id: string;
  rental_company_organization_id: string;
  status: string;
  indicative_rate: number | null;
  indicative_rate_unit: string | null;
  notes: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface QuotationReferenceSequencesTable {
  organization_id: string;
  next_value: number;
}

export interface CommercialQuotationsTable {
  id: Generated<string>;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  client_snapshot: unknown | null;
  requirement_id: string | null;
  quotation_response_id: string | null;
  source_auction_id: string | null;
  reference_number: string;
  machine_id: string;
  start_date: string;
  end_date: string | null;
  rate: number;
  rate_unit: string;
  mobilization_charge: number | null;
  demobilization_charge: number | null;
  overtime_rate: number | null;
  payment_terms: string | null;
  shift_structure: string | null;
  sunday_condition: string | null;
  fuel_norms: string | null;
  fuel_scope: string | null;
  dehire_terms: string | null;
  operator_scope: string | null;
  accommodation_scope: string | null;
  working_hours: number | null;
  working_days_per_week: number | null;
  minimum_rental_period_value: number | null;
  minimum_rental_period_unit: string | null;
  gst_terms: string | null;
  notice_period_days: number | null;
  validity_date: string;
  commercial_notes: string | null;
  company_terms: string | null;
  status: string;
  renter_accepted_at: Date | string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface QuotationScopeItemsTable {
  id: Generated<string>;
  quotation_id: string;
  item: string;
  responsible_party: string;
  notes: string | null;
  created_at: CreatedAt;
}

export interface WorkOrderReferenceSequencesTable {
  organization_id: string;
  next_value: Generated<number>;
}

export interface WorkOrdersTable {
  id: Generated<string>;
  reference_number: string;
  quotation_id: string;
  rental_id: string;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  client_snapshot: unknown | null;
  project_id: string | null;
  machine_id: string;
  start_date: string;
  end_date: string | null;
  rate: number;
  rate_unit: string;
  mobilization_charge: number | null;
  demobilization_charge: number | null;
  overtime_rate: number | null;
  payment_terms: string | null;
  shift_structure: string | null;
  sunday_condition: string | null;
  fuel_norms: string | null;
  fuel_scope: string | null;
  dehire_terms: string | null;
  operator_scope: string | null;
  accommodation_scope: string | null;
  working_hours: number | null;
  working_days_per_week: number | null;
  minimum_rental_period_value: number | null;
  minimum_rental_period_unit: string | null;
  gst_terms: string | null;
  notice_period_days: number | null;
  commercial_notes: string | null;
  company_terms: string | null;
  status: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface WorkOrderScopeItemsTable {
  id: Generated<string>;
  work_order_id: string;
  item: string;
  responsible_party: string;
  notes: string | null;
  created_at: CreatedAt;
}

export interface QuotationOffersTable {
  id: Generated<string>;
  quotation_id: string;
  offered_by_organization_id: string;
  rate: number;
  rate_unit: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  status: string;
  created_at: CreatedAt;
}

export interface NotificationsTable {
  id: Generated<string>;
  recipient_organization_id: string;
  type: string;
  title: string;
  message: string;
  related_resource_type: string | null;
  related_resource_id: string | null;
  read_at: Date | string | null;
  created_at: CreatedAt;
}

export interface MaintenanceRecordsTable {
  id: Generated<string>;
  machine_id: string;
  maintenance_type: string;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TransportRecordsTable {
  id: Generated<string>;
  rental_id: string;
  leg: string;
  pickup_location: string | null;
  destination: string | null;
  planned_date: string | null;
  actual_date: string | null;
  status: string;
  transport_details: string | null;
  charges: number | null;
  notes: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface LogsheetsTable {
  id: Generated<string>;
  rental_id: string;
  machine_id: string;
  log_date: string;
  shift: string | null;
  operating_hours: number | null;
  idle_hours: number | null;
  overtime_hours: number | null;
  operator_name: string | null;
  fuel_consumed: number | null;
  fuel_unit: string | null;
  remarks: string | null;
  customer_confirmed: boolean;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface InvoicesTable {
  id: Generated<string>;
  rental_company_organization_id: string;
  rental_id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  adjustment_amount: number;
  total_amount: number;
  due_date: string;
  notes: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface InvoiceLineItemsTable {
  id: Generated<string>;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: CreatedAt;
}

export interface PaymentsTable {
  id: Generated<string>;
  invoice_id: string;
  amount: number;
  paid_date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: CreatedAt;
}

export interface InvoiceReferenceSequencesTable {
  organization_id: string;
  next_value: number;
}
