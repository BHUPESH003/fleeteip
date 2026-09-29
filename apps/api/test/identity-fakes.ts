// Stubs for the session-management repository methods that most identity
// tests never reach — spread into a fake so each test lists only what it uses.
const unused = async (): Promise<never> => {
  throw new Error("not used in this test");
};

export const UNUSED_USER_PASSWORD_METHODS = {
  findPasswordHashById: unused,
  updatePasswordHash: unused,
};

export const UNUSED_SESSION_MANAGEMENT_METHODS = {
  touch: unused,
  listActiveByUserId: unused,
  deleteByIdForUser: unused,
  deleteOthersForUser: unused,
};
