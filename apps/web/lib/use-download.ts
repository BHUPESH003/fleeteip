"use client";

import { useToast } from "@fleetip/ui";
import { useCallback, useState } from "react";
import { downloadDocument } from "./api-client";
import { describeError } from "./errors";

/** Downloads a generated document; a failure becomes a toast naming what didn't download. */
export function useDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = useCallback(
    async (path: string, what: string) => {
      setBusy(true);
      try {
        await downloadDocument(path);
      } catch (error) {
        toast.error({ title: `${what} wasn't downloaded`, body: describeError(error).body });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { download, busy };
}
