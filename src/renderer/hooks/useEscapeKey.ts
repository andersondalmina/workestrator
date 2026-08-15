import { useEffect } from "react";

export interface EscapeKeyOptions {
  /**
   * Takes the key press before anything else sees it, so the layer underneath
   * is left where it is. A menu inside the task panel needs this: both are
   * listening on the window, and dismissing the menu should not also dismiss
   * the panel it is drawn in.
   */
  first?: boolean;
}

/** Runs `handler` while `active`, whenever Escape is pressed. */
export function useEscapeKey(
  active: boolean,
  handler: () => void,
  { first = false }: EscapeKeyOptions = {},
): void {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Listening in the capture phase is what makes this the first handler
        // regardless of which layer registered first; stopping the event there
        // keeps it from ever reaching the ones below.
        if (first) event.stopPropagation();
        handler();
      }
    };
    window.addEventListener("keydown", onKeyDown, first);
    return () => window.removeEventListener("keydown", onKeyDown, first);
  }, [active, handler, first]);
}
