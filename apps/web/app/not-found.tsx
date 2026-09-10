import { ErrorState, PageHeader } from "@fleetip/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <PageHeader title="Page not found" />
      <ErrorState message="The page you're looking for doesn't exist." />
    </div>
  );
}
