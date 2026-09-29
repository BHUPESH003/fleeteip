import { ForbiddenPage } from "../../../components/PageStates";

/**
 * Full-page 403 ("403 · No access"): says what's missing and who can grant
 * it, with Back to dashboard (and Switch organization when there's more
 * than one).
 */
export default function UnauthorizedPage() {
  return (
    <ForbiddenPage
      what="that page"
      permissionHint="Your role doesn't include the permission it needs, so FleetIP didn't open it."
    />
  );
}
