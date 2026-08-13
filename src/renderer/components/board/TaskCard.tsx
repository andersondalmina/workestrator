import type { KeyboardEvent } from "react";
import { TONE } from "../../data/board";
import { useWorkspace } from "../../store/WorkspaceProvider";
import type { BoardTask } from "../../types";
import { BranchIcon, FolderIcon, PullRequestIcon } from "../icons";

const BADGE = "rounded-[5px] px-[7px] py-[5px] font-mono text-[10.5px] leading-none font-normal";

/** Colours of a badge, kept apart so the "you" badge can swap both at once. */
const BADGE_PLAIN = "bg-panel2 text-fg3";
const BADGE_MINE = "bg-[color-mix(in_oklch,var(--violet)_18%,var(--panel2))] text-violet";

export function TaskCard({ task }: { task: BoardTask }) {
  const { isAllScope, openTask, reviewingIds } = useWorkspace();
  const statusColor = TONE[task.tone];
  const prColor = TONE[task.prTone ?? "fg"];
  const reviewing = reviewingIds.has(task.id);

  // The whole card opens the detail panel, but it holds buttons of its own, so
  // it cannot be a button itself without nesting one inside another.
  const openOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openTask(task.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      // Cards waiting on a human get a warmer edge.
      className={`flex w-full cursor-pointer flex-col gap-[10px] rounded-[10px] border bg-card p-[var(--pad)] text-left shadow-card hover:border-line hover:bg-cardh ${
        task.tone === "orange"
          ? "border-[color-mix(in_oklch,var(--orange)_34%,var(--lines))]"
          : "border-lines"
      }`}
      onClick={() => openTask(task.id)}
      onKeyDown={openOnEnter}
    >
      {isAllScope && (
        <div className="flex min-w-0 items-center gap-[6px]">
          <FolderIcon size={12} color={task.repoColor} />
          <span className="truncate font-mono text-[10.5px] leading-none font-normal text-fg4">
            {task.repo}
          </span>
        </div>
      )}

      <div className="font-sans text-[13.5px] leading-[1.4] font-semibold tracking-[-0.005em] text-pretty">
        {task.title}
      </div>

      <div className="flex min-w-0 items-center gap-[7px]">
        <BranchIcon size={13} color="var(--fg4)" />
        <span className="truncate font-mono text-[11.5px] leading-none font-normal text-fg3">
          {task.branch}
        </span>
      </div>

      <div className="flex flex-wrap gap-[5px]">
        {/* A fetched pull request has an author where a dispatched one has a
            skill. "In review" mixes your own pull requests with the ones you
            have already looked at, so yours say so. */}
        <span className={`${BADGE} ${task.mine ? BADGE_MINE : BADGE_PLAIN}`}>
          {task.skill ?? (task.mine ? "you" : `@${task.author}`)}
        </span>
        {task.plus && (
          <span className={`${BADGE} ${BADGE_PLAIN}`}>
            <span className="text-green">{task.plus}</span>{" "}
            <span className="text-red">{task.minus}</span>
          </span>
        )}
      </div>

      <div className="h-px bg-lines" />

      {task.pr && (
        <div className="flex items-center gap-2">
          <PullRequestIcon size={13} color={prColor} />
          <span className="font-mono text-[11.5px] leading-none font-normal text-fg3">
            #{task.pr}
          </span>
          <span
            className="font-sans text-[11.5px] leading-none font-medium"
            style={{ color: prColor }}
          >
            {task.prState}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="flex size-[13px] flex-none items-center justify-center">
          <span
            className="size-[9px] opacity-90"
            style={{ borderRadius: task.mark ?? "50%", background: statusColor }}
          />
        </span>
        <span
          className="flex-1 font-sans text-xs leading-[1.3] font-medium"
          style={{ color: statusColor }}
        >
          {task.status}
        </span>
        <span className="font-mono text-[11px] leading-none font-normal text-fg4">{task.time}</span>
      </div>

      {/* An agent reading this pull request is worth seeing without opening
          the panel it was started from. */}
      {reviewing && (
        <div className="flex animate-wk-pulse items-center gap-2">
          <span className="flex size-[13px] flex-none items-center justify-center">
            <span className="size-[9px] rounded-full bg-blue opacity-90" />
          </span>
          <span className="flex-1 font-sans text-xs leading-[1.3] font-medium text-blue">
            Reviewing…
          </span>
        </div>
      )}
    </div>
  );
}
