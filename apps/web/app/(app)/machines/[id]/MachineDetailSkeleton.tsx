import { KeyFiguresSkeleton, Skeleton } from "@fleetip/ui";

/** Matches the final layout (header, 132px attention, 5 figures, 188px lanes) so nothing jumps on load. */
export function MachineDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading machine" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-[18px] pt-4">
        <Skeleton className="h-2.5 w-[180px]" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-[52px] w-[52px] rounded-control" />
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[260px] max-w-[80%]" />
            <Skeleton className="h-3 w-[420px] max-w-[90%] bg-[#eef0f2]" />
          </div>
          <div className="h-[34px] w-[150px] rounded-control bg-[#eef0f2]" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[18px]">
        <div className="h-[132px] rounded-panel border border-border-soft bg-surface" />
        <KeyFiguresSkeleton count={5} />
        <div className="h-[188px] rounded-panel border border-border-soft bg-surface" />
        <span role="status" className="text-xs text-meta">
          Loading machine…
        </span>
      </div>
    </div>
  );
}
