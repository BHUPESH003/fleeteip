import { PageError } from "@fleetip/ui";
import Link from "next/link";
import { LINK_PRIMARY, Wordmark } from "./(public)/AuthShell";

/** App-wide 404 for a URL that matches no page. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <Wordmark />
      <PageError
        code="404 · Not found"
        title="We can't find that page"
        body="The link may be wrong or out of date. Records in FleetIP aren't deleted, so if you followed a link to one, it may belong to another organization."
        primary={
          <Link href="/" className={LINK_PRIMARY}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
