import { ErrorState, PageHeader } from "@fleetip/ui";

export default function UnauthorizedPage() {
  return (
    <>
      <PageHeader title="Access denied" />
      <ErrorState message="You don't have permission to view this page." />
    </>
  );
}
