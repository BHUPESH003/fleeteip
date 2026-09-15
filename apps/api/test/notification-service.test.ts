import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  CreateNotificationInput,
  NotificationRecord,
  NotificationRepositoryPort,
} from "../src/modules/notification/domain/ports.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import { ForbiddenError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const RENTER_ORG_ID = "org-renter";

function fakePermissionService(): PermissionService {
  const membershipRepository: MembershipRepositoryPort = {
    updateRole: async () => {
      throw new Error("not used in this test");
    },
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name, organization_id: null }),
    findById: async () => {
      throw new Error("not used in this test");
    },
    listForOrganization: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
    delete: async () => {
      throw new Error("not used in this test");
    },
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["organization.manage"] : [],
  };
  const organizationTypes: Record<string, OrganizationTypeCode> = {
    [RC_ORG_ID]: "rental_company",
    [RENTER_ORG_ID]: "renter",
  };
  const organizationRepository: OrganizationRepositoryPort = {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    findWithTypeById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        organization_type_code: organizationTypeCode,
        name: "Test Org",
        code: "TESTORG",
        status: "active",
        created_at: new Date(),
      };
    },
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
  return new PermissionService(membershipRepository, roleRepository, organizationRepository);
}

function fakeNotificationRepository(): NotificationRepositoryPort {
  const records = new Map<string, NotificationRecord>();
  let nextId = 1;
  return {
    create: async (input: CreateNotificationInput) => {
      const record: NotificationRecord = {
        id: `notification-${nextId++}`,
        recipient_organization_id: input.recipientOrganizationId,
        type: input.type,
        title: input.title,
        message: input.message,
        related_resource_type: input.relatedResourceType ?? null,
        related_resource_id: input.relatedResourceId ?? null,
        read_at: null,
        created_at: new Date(),
      };
      records.set(record.id, record);
      return record;
    },
    listByOrganization: async (organizationId) =>
      [...records.values()]
        .filter((r) => r.recipient_organization_id === organizationId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    countUnread: async (organizationId) =>
      [...records.values()].filter(
        (r) => r.recipient_organization_id === organizationId && r.read_at === null,
      ).length,
    markRead: async (id, organizationId) => {
      const existing = records.get(id);
      if (!existing || existing.recipient_organization_id !== organizationId) return undefined;
      const updated = { ...existing, read_at: new Date() };
      records.set(id, updated);
      return updated;
    },
    markAllRead: async (organizationId) => {
      for (const [id, record] of records) {
        if (record.recipient_organization_id === organizationId && record.read_at === null) {
          records.set(id, { ...record, read_at: new Date() });
        }
      }
    },
  };
}

function buildService() {
  return new NotificationService(fakeNotificationRepository(), fakePermissionService());
}

describe("NotificationService", () => {
  it("creates a notification with no permission check (system-triggered)", async () => {
    const service = buildService();
    const notification = await service.notify({
      recipientOrganizationId: RENTER_ORG_ID,
      type: "quotation.sent",
      title: "Quotation sent",
      message: "Apex Rentals sent you a quotation for REQ-102.",
      relatedResourceType: "quotation",
      relatedResourceId: "quotation-1",
    });
    expect(notification.recipientOrganizationId).toBe(RENTER_ORG_ID);
    expect(notification.readAt).toBeNull();
  });

  it("lists notifications and unread count for the caller's own organization", async () => {
    const service = buildService();
    await service.notify({
      recipientOrganizationId: RENTER_ORG_ID,
      type: "quotation.sent",
      title: "Quotation sent",
      message: "message-1",
    });
    await service.notify({
      recipientOrganizationId: RC_ORG_ID,
      type: "auction.participant_approved",
      title: "Approved to bid",
      message: "message-2",
    });

    const forRenter = await service.list("user-1", RENTER_ORG_ID);
    expect(forRenter.notifications).toHaveLength(1);
    expect(forRenter.unreadCount).toBe(1);

    const forRentalCompany = await service.list("user-1", RC_ORG_ID);
    expect(forRentalCompany.notifications).toHaveLength(1);
  });

  it("marks a single notification read, scoped to the caller's own organization", async () => {
    const service = buildService();
    const notification = await service.notify({
      recipientOrganizationId: RENTER_ORG_ID,
      type: "quotation.sent",
      title: "Quotation sent",
      message: "message-1",
    });

    // A different organization cannot mark someone else's notification read.
    const wrongOrgResult = await service.markRead("user-2", RC_ORG_ID, notification.id);
    expect(wrongOrgResult).toBeUndefined();

    const read = await service.markRead("user-1", RENTER_ORG_ID, notification.id);
    expect(read?.readAt).not.toBeNull();

    const after = await service.list("user-1", RENTER_ORG_ID);
    expect(after.unreadCount).toBe(0);
  });

  it("marks every notification for an organization read at once", async () => {
    const service = buildService();
    await service.notify({
      recipientOrganizationId: RENTER_ORG_ID,
      type: "quotation.sent",
      title: "a",
      message: "a",
    });
    await service.notify({
      recipientOrganizationId: RENTER_ORG_ID,
      type: "quotation.rejected",
      title: "b",
      message: "b",
    });

    await service.markAllRead("user-1", RENTER_ORG_ID);
    const after = await service.list("user-1", RENTER_ORG_ID);
    expect(after.unreadCount).toBe(0);
  });

  it("rejects listing another organization's notifications without membership", async () => {
    const service = buildService();
    await expect(service.list("user-3", "org-unrelated")).rejects.toThrow(ForbiddenError);
  });

  // Regression: notifications are a member's own inbox, not an admin config
  // surface — listing/marking read must work for ANY active member,
  // regardless of which (if any) permissions their role holds. This used to
  // require organization.manage, which locked out every non-owner custom
  // role (see docs/decisions.md).
  it("lists and marks notifications read for a member whose role holds no permissions at all", async () => {
    const membershipRepository: MembershipRepositoryPort = {
      updateRole: async () => {
        throw new Error("not used in this test");
      },
      findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
        id: "membership-2",
        status: "active",
        role_id: "role-no-permissions",
      }),
      create: async () => {
        throw new Error("not used in this test");
      },
      listWithOrganizationByUserId: async () => [],
      listByOrganization: async () => {
        throw new Error("not used in this test");
      },
    };
    const roleRepository: RoleRepositoryPort = {
      findByName: async () => {
        throw new Error("not used in this test");
      },
      findById: async () => {
        throw new Error("not used in this test");
      },
      listForOrganization: async () => {
        throw new Error("not used in this test");
      },
      create: async () => {
        throw new Error("not used in this test");
      },
      update: async () => {
        throw new Error("not used in this test");
      },
      delete: async () => {
        throw new Error("not used in this test");
      },
      hasPermission: async () => false,
      listPermissionCodesByRoleId: async () => [],
    };
    const organizationRepository: OrganizationRepositoryPort = {
      findTypeByCode: async () => {
        throw new Error("not used in this test");
      },
      create: async () => {
        throw new Error("not used in this test");
      },
      findById: async () => {
        throw new Error("not used in this test");
      },
      findWithTypeById: async (id) => ({
        id,
        organization_type_id: "type-rental_company",
        organization_type_code: "rental_company",
        name: "Test Org",
        code: "TESTORG",
        status: "active",
        created_at: new Date(),
      }),
      listAllForPlatformAdmin: async () => {
        throw new Error("not used in this test");
      },
      updateStatus: async () => {
        throw new Error("not used in this test");
      },
      codeExists: async () => {
        throw new Error("not used in this test");
      },
      listByType: async () => {
        throw new Error("not used in this test");
      },
    };
    const permissionService = new PermissionService(
      membershipRepository,
      roleRepository,
      organizationRepository,
    );
    const service = new NotificationService(fakeNotificationRepository(), permissionService);

    const notification = await service.notify({
      recipientOrganizationId: RC_ORG_ID,
      type: "quotation.sent",
      title: "Quotation sent",
      message: "message-1",
    });

    const preview = await service.list("user-no-permissions", RC_ORG_ID);
    expect(preview.notifications).toHaveLength(1);

    const read = await service.markRead("user-no-permissions", RC_ORG_ID, notification.id);
    expect(read?.readAt).not.toBeNull();

    await expect(service.markAllRead("user-no-permissions", RC_ORG_ID)).resolves.toBeUndefined();
  });
});
