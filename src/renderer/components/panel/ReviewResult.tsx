import { useEffect, useState } from "react";
import { TONE } from "../../data/board";
import { relativeTime } from "../../store/pullRequests";
import { useWorkspace } from "../../store/WorkspaceProvider";
import type { StoredReview } from "../../../shared/ipc";

interface ReviewResultProps {
  /** `null` while the review is still being read out of the database. */
  review: StoredReview | null;
}

/** A review that is still going has nothing written down to show yet. */
function placeholder(review: StoredReview): string {
  return review.status === "running"
    ? "The agent is reading this pull request…"
    : "This review has nothing to show yet.";
}

/**
 * What the agent made of a pull request, in its own words. The text is
 * markdown, and it is shown as written: the app carries no markdown renderer,
 * and a review reads perfectly well as the agent laid it out.
 */
export function ReviewResult({ review }: ReviewResultProps) {
  const { closeReview, cancelReview } = useWorkspace();
  const running = review?.status === "running";

  // Stopping the agent is not instant — the main process kills it and reports
  // back — so the button says what it is doing rather than sitting there
  // looking unpressed and inviting a second press.
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!running) setStopping(false);
  }, [running]);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-lines px-[10px] py-[7px] font-sans text-[11.5px] leading-none font-medium text-fg2 hover:border-line hover:text-fg"
          onClick={closeReview}
        >
          ← Reviews
        </button>
        {review && (
          <span className="font-mono text-[11px] leading-none font-normal text-fg4">
            {relativeTime(review.startedAt)}
          </span>
        )}
        {review && running && (
          <button
            type="button"
            className="ml-auto rounded-lg border border-lines px-[10px] py-[7px] font-sans text-[11.5px] leading-none font-medium disabled:opacity-50"
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
        <div className="animate-wk-pulse font-mono text-[11.5px] leading-none font-normal text-fg4">
          Reading the review…
        </div>
      ) : (
        <div
          className="rounded-[10px] border border-lines bg-card p-3 font-mono text-[11.5px] leading-[1.55] font-normal wrap-break-word whitespace-pre-wrap"
          style={{ color: review.status === "failed" ? TONE.red : "var(--fg2)" }}
        >
          {review.result || placeholder(review)}
        </div>
      )}
    </>
  );
}
