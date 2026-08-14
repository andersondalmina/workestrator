import { useEffect, useMemo, useRef, useState } from "react";
import { AgentTimeline, AgentTokenTotals } from "./AgentTimeline";
import { TONE } from "../../data/board";
import { relativeTime } from "../../store/pullRequests";
import { useWorkspace } from "../../store/WorkspaceProvider";
import type { AgentEvent } from "../../../shared/agentEvent";
import type { StoredReview } from "../../../shared/ipc";

/** How near the bottom counts as being at it, in pixels. */
const AT_BOTTOM = 40;

interface ReviewResultProps {
  /** `null` while the review is still being read out of the database. */
  review: StoredReview | null;
}

/**
 * What the agent made of a pull request, and what it did to get there. The
 * timeline shows the run as it happens; underneath it sits whatever was
 * written down, which is all a review from an earlier launch has left.
 *
 * The text is markdown, and it is shown as written: the app carries no
 * markdown renderer, and a review reads perfectly well as the agent laid it
 * out.
 */
export function ReviewResult({ review }: ReviewResultProps) {
  const { closeReview, cancelReview, eventsFor } = useWorkspace();
  const running = review?.status === "running";
  // Held steady between renders, so the feed only scrolls itself when
  // something has actually arrived to scroll to.
  const events = useMemo(() => (review ? eventsFor(review.id) : []), [review, eventsFor]);

  // Stopping the agent is not instant — the main process kills it and reports
  // back — so the button says what it is doing rather than sitting there
  // looking unpressed and inviting a second press.
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!running) setStopping(false);
  }, [running]);

  const stored = review ? storedText(review, events) : "";

  // The feed follows itself down while it is being read at the bottom, and
  // stays put the moment it is scrolled away from — the same bargain every
  // chat window makes. Held in a ref because scrolling must not re-render the
  // list it is scrolling.
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [events, stored, running]);

  return (
    <>
      <div className="flex flex-none items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-lines px-[10px] py-[7px] font-sans text-[13px] leading-none font-medium text-fg2 hover:border-line hover:text-fg"
          onClick={closeReview}
        >
          ← Reviews
        </button>
        {review && (
          <span className="font-mono text-[12.5px] leading-none font-normal text-fg4">
            {relativeTime(review.startedAt)}
          </span>
        )}
        {review && running && (
          <button
            type="button"
            className="ml-auto rounded-lg border border-lines px-[10px] py-[7px] font-sans text-[13px] leading-none font-medium disabled:opacity-50"
            style={{ color: TONE.red, borderColor: stopping ? undefined : TONE.red }}
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              cancelReview(review.id);
            }}
          >
            {stopping ? "Cancelling…" : "Cancel review"}
          </button>
        )}
      </div>

      {review === null ? (
        <div className="animate-wk-pulse font-mono text-[13px] leading-none font-normal text-fg4">
          Reading the review…
        </div>
      ) : (
        <div
          ref={scroller}
          onScroll={() => {
            const element = scroller.current;
            if (!element) return;
            pinned.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < AT_BOTTOM;
          }}
          className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto"
        >
          <AgentTimeline events={events} running={running} />
          {stored && (
            <div
              className="rounded-[10px] border border-lines bg-card p-3 font-mono text-[13px] leading-[1.55] font-normal wrap-break-word whitespace-pre-wrap"
              style={{ color: review.status === "failed" ? TONE.red : "var(--fg2)" }}
            >
              {stored}
            </div>
          )}
        </div>
      )}

      <AgentTokenTotals events={events} />
    </>
  );
}

/**
 * What the review has written down, when that is not already in the timeline.
 * A review that finished says the same thing twice otherwise: what it was left
 * with is the last thing the agent said, which is also the last block of the
 * feed — the message it finished for a run that worked, and the reason the
 * session gave up for one that did not.
 *
 * What is left is worth showing — that a run was cancelled, why one failed
 * before the agent ever spoke, and every review from a launch this window did
 * not see.
 */
function storedText(review: StoredReview, events: AgentEvent[]): string {
  if (review.status === "running") return "";
  if (review.result && !spoken(events, review.result)) return review.result;
  if (!review.result && events.length === 0) return "This review has nothing to show yet.";
  return "";
}

/** Whether the timeline is already showing this, as a message or as a failure. */
function spoken(events: AgentEvent[], result: string): boolean {
  return events.some(
    (event) =>
      (event.kind === "text" && event.text === result) ||
      (event.kind === "error" && event.message === result),
  );
}
