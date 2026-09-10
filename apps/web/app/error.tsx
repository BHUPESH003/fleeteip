"use client";

import { Button, ErrorState, PageHeader } from "@fleetip/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <PageHeader title="Something went wrong" />
      <ErrorState
        message={error.message || "An unexpected error occurred."}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
