import { TONE } from "../../data/board";
import { relativeTime } from "../../store/pullRequests";
import { useWorkspace } from "../../store/WorkspaceProvider";
import type { Tone } from "../../types";
import type { ReviewStatus, ReviewSummary } from "../../../shared/ipc";

const STATUS_TONE: Record<ReviewStatus, Tone> = {
  running: "blue",
  completed: "green",
  cancelled: "fg",
  failed: "red",
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  running: "reviewing",
  completed: "reviewed",
  cancelled: "cancelled",
  failed: "failed",
};

/**
 * Every time the review agent has been sent at this pull request, newest
 * first. A row is only a heading — what the agent wrote is read from the
 * database when one is picked, since a list of full reviews would be most of
 * the panel's weight for text nobody is looking at yet.
 */
export function TaskReviews({ reviews }: { reviews: ReviewSummary[] }) {
  const { openReviewById } = useWorkspace();

  return (
    <div className="overflow-hidden rounded-[10px] border border-lines">
      {reviews.map((review) => (
        <button
          key={review.id}
          type="button"
          className="flex w-full items-center gap-[10px] border-b border-lines bg-card px-3 py-[10px] text-left last:border-b-0 hover:bg-cardh"
          onClick={() => openReviewById(review.id)}
        >
          <span
            className={`size-[7px] flex-none rounded-full ${
              review.status === "running" ? "animate-wk-pulse" : ""
            }`}
            style={{ background: TONE[STATUS_TONE[review.status]] }}
          />
          <span className="flex-1 font-mono text-[13px] leading-none font-normal text-fg2">
            {relativeTime(review.startedAt)}
          </span>
          <span
            className="font-sans text-[12.5px] leading-none font-medium"
            style={{ color: TONE[STATUS_TONE[review.status]] }}
          >
            {STATUS_LABEL[review.status]}
          </span>
        </button>
      ))}
    </div>
  );
}
