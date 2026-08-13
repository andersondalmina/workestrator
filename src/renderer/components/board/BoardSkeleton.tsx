/** Card heights per column, mirroring the shape of a loaded board. */
const SKELETON_COLUMNS = [["132px", "104px"], ["150px"], ["118px", "138px"], ["112px"]];

export function BoardSkeleton() {
  return (
    <div className="flex flex-1 overflow-hidden px-1" aria-hidden="true">
      {SKELETON_COLUMNS.map((rows, columnIndex) => (
        <div
          key={columnIndex}
          className="w-[var(--colw)] flex-none border-r border-lines px-3 py-[14px]"
        >
          <div className="flex h-[22px] animate-wk-pulse items-center gap-[9px]">
            <div className="size-[9px] rounded-[3px] bg-line" />
            <div className="h-[9px] w-24 rounded bg-line" />
          </div>
          <div className="mt-4 flex flex-col gap-[var(--cgap)]">
            {rows.map((height, rowIndex) => (
              <div
                key={rowIndex}
                className="animate-wk-pulse rounded-[10px] border border-lines bg-card"
                style={{ height }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
