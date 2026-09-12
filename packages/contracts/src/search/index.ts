import { z } from "zod";

// Cross-resource global search — the header search box. Deliberately a thin
// projection (id/type/title/subtitle), not each resource's full contract
// shape: the caller re-fetches the real resource once they pick a result.
// See docs/frontend-backend-gap-report.md's Phase 1 entry (global search)
// and apps/api/src/modules/search/application/search-service.ts for how the
// resource set is designed to grow later (one more branch, not a rewrite).
export const searchResultTypeSchema = z.enum(["machine", "requirement", "quotation", "rental"]);
export type SearchResultType = z.infer<typeof searchResultTypeSchema>;

export const searchResultSchema = z.object({
  type: searchResultTypeSchema,
  id: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
