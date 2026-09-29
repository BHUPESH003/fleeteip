import { Button } from "./Button";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Total rows, to show "1–10 of 42". */
  total?: number;
  pageSize?: number;
  /** Noun for the count, e.g. "machines". */
  noun?: string;
}

export function Pagination({ page, pageCount, onPageChange, total, pageSize, noun = "rows" }: PaginationProps) {
  const showRange = total !== undefined && pageSize !== undefined;
  const from = showRange ? (total === 0 ? 0 : (page - 1) * pageSize + 1) : 0;
  const to = showRange ? Math.min(total, page * pageSize) : 0;
  return (
    <nav aria-label="Pagination" className="ml-auto flex items-center gap-3 text-xs text-meta">
      {showRange && (
        <span aria-live="polite">
          <span className="font-mono">
            {from}–{to}
          </span>{" "}
          of <span className="font-mono">{total}</span> {noun}
        </span>
      )}
      {pageCount > 1 && (
        <span className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon="back"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            Prev
          </Button>
          <span className="px-1 font-mono">
            {page} / {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            iconRight="chevron_right"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next
          </Button>
        </span>
      )}
    </nav>
  );
}
