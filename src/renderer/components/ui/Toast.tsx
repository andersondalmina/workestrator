import { useEffect } from "react";
import { CloseIcon } from "../icons";

/** How long a message stays on screen before it clears itself. */
const VISIBLE_MS = 7_000;

interface ToastProps {
  message: string;
  /** Red reports something that did not happen; green, something that did. */
  tone?: "red" | "green";
  onDismiss: () => void;
}

/**
 * A line at the foot of the board — why "Add project" did nothing, what the
 * last fetch found. These flows have no dialog of their own, so this is the
 * only thing they have to say.
 */
export function Toast({ message, tone = "red", onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      className="pointer-events-auto flex max-w-[460px] animate-wk-pop items-center gap-[10px] rounded-[10px] border border-line bg-panel py-[10px] pr-[10px] pl-3 shadow-dialog"
      role="alert"
    >
      <span
        className={`size-[6px] flex-none rounded-full ${tone === "green" ? "bg-green" : "bg-red"}`}
      />
      <span className="font-mono text-[11.5px] leading-[1.4] font-normal text-pretty text-fg2">
        {message}
      </span>
      <button
        type="button"
        className="flex size-[22px] flex-none items-center justify-center rounded-[6px] hover:bg-panel2"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <CloseIcon size={12} color="var(--fg3)" />
      </button>
    </div>
  );
}
