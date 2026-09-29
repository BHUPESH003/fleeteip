import { KeyFiguresSkeleton, Skeleton } from "@fleetip/ui";

/** Matches the final layout (header, 5 figures, chain, terms + aside, tabs) so nothing jumps on load. */
export function RentalDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading rental" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-[18px] pt-4 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[160px]" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-[52px] w-[52px] rounded-control" />
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[200px] max-w-[80%]" />
            <Skeleton className="h-3 w-[440px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[140px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 pb-8 pt-4 max-[760px]:px-4">
        <KeyFiguresSkeleton count={5} />
        <div className="h-[92px] rounded-panel border border-border-soft bg-surface" />
        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <div className="h-[260px] rounded-panel border border-border-soft bg-surface" />
            <div className="h-[220px] rounded-panel border border-border-soft bg-surface" />
          </div>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[380px]">
            <div className="h-[120px] rounded-panel border border-border-soft bg-surface" />
            <div className="h-[140px] rounded-panel border border-border-soft bg-surface" />
          </div>
        </div>
        <span role="status" className="text-xs text-meta">
          Loading rental…
        </span>
      </div>
    </div>
  );
}
