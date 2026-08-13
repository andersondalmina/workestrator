import { Fragment } from "react";
import { ReviewResult } from "./ReviewResult";
import { TaskReviews } from "./TaskReviews";
import { COLUMNS, TONE } from "../../data/board";
import { useWorkspace } from "../../store/WorkspaceProvider";
import type { BoardTask, Check, TimelineEvent } from "../../types";
import { CloseIcon } from "../icons";

const SECTION_LABEL =
  "font-sans text-[10.5px] leading-none font-medium tracking-[0.07em] text-fg4 uppercase";

/** Falls back to a summary line when a task carries no recorded history. */
function timelineFor(task: BoardTask): TimelineEvent[] {
  return (
    task.timeline ?? [
      {
        text: task.status,
        by: `${task.skill ?? `@${task.author}`} · ${task.time}`,
        tone: task.tone,
      },
    ]
  );
}

/**
 * A task reports the checks it carries and nothing else: a task with none
 * recorded yet shows no check list rather than one made up on its behalf.
 */
function checksFor(task: BoardTask): Check[] {
  return task.checks ?? [];
}

/** A fetched pull request knows its own page; a composed task is on GitHub. */
function remoteUrl(task: BoardTask): string {
  if (task.url) return task.url;
  return task.pr
    ? `https://github.com/${task.repo}/pull/${task.pr}`
    : `https://github.com/${task.repo}/tree/${task.branch}`;
}

/** The platform a task's links and history belong to. */
function platformName(task: BoardTask): string {
  return task.platform === "gitlab" ? "GitLab" : "GitHub";
}

/**
 * An agent is sent at a pull request, not at an idea of one: it is given the
 * URL to read and the branch to check out, so a task the app made up itself
 * has nothing to review yet.
 */
function isReviewable(task: BoardTask): boolean {
  return Boolean(task.pr && task.url && task.platform);
}

export function TaskPanel({ task }: { task: BoardTask }) {
  const { closeTask, reviewsFor, reviewingIds, startReview, openReview, openReviewBusy } =
    useWorkspace();
  const column = COLUMNS.find((entry) => entry.id === task.col);
  const checks = checksFor(task);
  const reviews = reviewsFor(task.id);
  const reviewing = reviewingIds.has(task.id);

  const meta = [
    { k: "Project", v: task.repo },
    { k: "Branch", v: task.branch },
    { k: "Base", v: "main" },
    task.skill ? { k: "Skill", v: task.skill } : { k: "Author", v: `@${task.author}` },
    { k: "State", v: task.prState ?? "local branch" },
    { k: "Updated", v: task.time },
  ];

  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 animate-wk-fade cursor-default bg-black/[0.32]"
        onClick={closeTask}
        aria-label="Close details"
      />

      <aside
        className="relative flex h-full w-[452px] animate-wk-in flex-col border-l border-line bg-panel shadow-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
      >
        <header className="flex-none border-b border-lines px-[18px] py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="size-2 rounded-[3px]" style={{ background: column?.color }} />
                <span className="font-sans text-[11px] leading-none font-medium text-fg3">
                  {column?.name}
                </span>
                <span className="font-mono text-[11px] leading-none font-normal text-fg4">
                  {task.pr ? `#${task.pr}` : "no PR yet"}
                </span>
              </div>
              <div className="font-sans text-base leading-[1.35] font-semibold tracking-[-0.012em] text-pretty">
                {task.title}
              </div>
            </div>
            <button
              type="button"
              className="flex size-7 flex-none items-center justify-center rounded-[7px] border border-lines hover:bg-panel2"
              onClick={closeTask}
              aria-label="Close"
            >
              <CloseIcon size={13} color="var(--fg3)" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-[18px] pt-4 pb-5">
          {/* A review takes the body over rather than opening beside it: it is
              the longest thing the panel ever shows, and this one is 452px. */}
          {openReview || openReviewBusy ? (
            <ReviewResult review={openReview} />
          ) : (
            <>
              <dl className="m-0 grid grid-cols-[84px_1fr] items-baseline gap-x-[14px] gap-y-[9px]">
                {meta.map((row) => (
                  <Fragment key={row.k}>
                    <dt className="font-sans text-[11px] leading-[1.5] font-normal text-fg4">
                      {row.k}
                    </dt>
                    <dd className="m-0 overflow-hidden text-ellipsis font-mono text-[11.5px] leading-[1.5] font-normal text-fg2">
                      {row.v}
                    </dd>
                  </Fragment>
                ))}
              </dl>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className={SECTION_LABEL}>PR activity</span>
                  <span className="rounded border border-lines px-[5px] py-[3px] font-mono text-[10px] leading-none font-normal text-fg4">
                    synced from {platformName(task).toLowerCase()}
                  </span>
                </div>
                <div className="flex flex-col">
                  {timelineFor(task).map((event, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex w-[9px] flex-none flex-col items-center">
                        <span
                          className="mt-1 size-[9px] flex-none rounded-full"
                          style={{ background: TONE[event.tone ?? "fg"] }}
                        />
                        <span className="w-px flex-1 bg-lines" />
                      </div>
                      <div className="flex-1 pb-[14px]">
                        <div className="font-sans text-[12.5px] leading-[1.4] font-medium text-fg">
                          {event.text}
                        </div>
                        <div className="mt-[3px] font-mono text-[11px] leading-[1.4] font-normal text-fg4">
                          {event.by}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {checks.length > 0 && (
                <section>
                  <div className={`mb-[10px] block ${SECTION_LABEL}`}>Checks</div>
                  <div className="overflow-hidden rounded-[10px] border border-lines">
                    {checks.map((check) => (
                      <div
                        key={check.name}
                        className="flex items-center gap-[10px] border-b border-lines bg-card px-3 py-[10px] last:border-b-0"
                      >
                        <span
                          className="size-[7px] flex-none rounded-full"
                          style={{ background: TONE[check.tone] }}
                        />
                        <span className="flex-1 font-mono text-[11.5px] leading-none font-normal text-fg2">
                          {check.name}
                        </span>
                        <span
                          className="font-sans text-[11px] leading-none font-medium"
                          style={{ color: TONE[check.tone] }}
                        >
                          {check.state}
                        </span>
                        <span className="font-mono text-[10.5px] leading-none font-normal text-fg4">
                          {check.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* The review button lives in the footer; this section only
                  shows what it produced. */}
              {(isReviewable(task) || reviews.length > 0) && (
                <section>
                  <div className="mb-[10px] flex items-center gap-2">
                    <span className={SECTION_LABEL}>Reviews</span>
                  </div>
                  {reviews.length > 0 ? (
                    <TaskReviews reviews={reviews} />
                  ) : (
                    <div className="font-mono text-[11.5px] leading-[1.5] font-normal text-fg4">
                      Nothing has read this pull request yet.
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-lines px-[18px] py-3">
          {/* The panel's primary action is always the review: a task the app
              made up itself has no pull request to hand an agent. */}
          <button
            type="button"
            className={`rounded-lg bg-btn px-[14px] py-[9px] font-sans text-[12.5px] leading-none font-semibold text-btnfg ${
              reviewing || !isReviewable(task)
                ? "cursor-default opacity-50"
                : "hover:opacity-[0.88]"
            } ${reviewing ? "animate-wk-pulse" : ""}`}
            onClick={() => startReview(task)}
            disabled={reviewing || !isReviewable(task)}
            title={
              isReviewable(task)
                ? `Checks #${task.pr} out and has the review agent read it`
                : "This task has no pull request to review yet"
            }
          >
            {reviewing ? "Reviewing…" : "Review"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-lines px-[13px] py-[9px] font-sans text-[12.5px] leading-none font-medium text-fg2 hover:border-line hover:text-fg"
            onClick={() => window.workestrator?.openExternal(remoteUrl(task))}
          >
            Open on {platformName(task)}
          </button>
          <div className="flex-1" />
          <span className="font-mono text-[10.5px] leading-none font-normal text-fg4">
            esc to close
          </span>
        </footer>
      </aside>
    </div>
  );
}
