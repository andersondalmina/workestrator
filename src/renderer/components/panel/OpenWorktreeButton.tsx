import { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { isReviewable } from "../../store/selectors";
import { useWorkspace } from "../../store/WorkspaceProvider";
import type { BoardTask } from "../../types";
import { ChevronIcon, FolderIcon } from "../icons";

/**
 * Opens the folder a pull request was checked out into. The first listed app
 * is the button itself — Finder, on a Mac — and the rest are behind the caret,
 * so the common case is one click and the others are still one menu away.
 *
 * There is only something to open once the pull request has been reviewed:
 * that is what checks it out. Rather than checking one out from here, which
 * would be a fetch behind a button in a header, the control is shown disabled
 * and says what would give it something to open. A task with no pull request
 * behind it has no such thing to say, so it gets no control at all.
 */
export function OpenWorktreeButton({ task }: { task: BoardTask }) {
  const { worktreeApps, reviewsFor, openWorktree } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  // The panel is listening for Escape as well, and closing this menu is not a
  // reason to close the panel it is drawn in.
  useEscapeKey(menuOpen, () => setMenuOpen(false), { first: true });

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!groupRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const [primary, ...rest] = worktreeApps;
  // The newest review is the one whose checkout is current: an older run left
  // its worktree at whatever the pull request was then.
  const reviewId = reviewsFor(task.id)[0]?.id ?? null;

  // Nothing was listed, so there is nothing this machine could open it in —
  // outside the Electron shell, that is every time. A task with no pull
  // request will never have a checkout either, and a control that can only
  // ever be greyed out is worse than no control.
  if (!primary || !isReviewable(task)) return null;

  const open = (appId: string) => {
    setMenuOpen(false);
    if (reviewId !== null) openWorktree(reviewId, appId);
  };

  const disabled = reviewId === null;
  const reason = "Review this pull request first — that is what checks it out";

  return (
    <div ref={groupRef} className="relative flex-none">
      {/* A disabled button takes no pointer events, so its own `title` never
          surfaces: the reason it is disabled is hung on the frame around it,
          which is still hoverable. */}
      <div
        className={`flex h-8 items-stretch overflow-hidden rounded-[7px] border border-lines ${
          disabled ? "opacity-50" : ""
        }`}
        title={disabled ? reason : undefined}
      >
        <button
          type="button"
          className={`flex w-8 items-center justify-center ${
            disabled ? "cursor-default" : "hover:bg-panel2"
          }`}
          onClick={() => open(primary.id)}
          disabled={disabled}
          aria-label={`Open the checkout in ${primary.name}`}
          title={disabled ? undefined : `Open the checkout in ${primary.name}`}
        >
          <FolderIcon size={13} color="var(--fg3)" />
        </button>

        {rest.length > 0 && (
          <button
            type="button"
            className={`flex w-[18px] items-center justify-center border-l border-lines ${
              disabled ? "cursor-default" : "hover:bg-panel2"
            }`}
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
            disabled={disabled}
            aria-label="Open the checkout in another app"
            title={disabled ? undefined : "Open the checkout in another app"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <ChevronIcon size={11} color="var(--fg3)" />
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="animate-wk-pop absolute top-[calc(100%+2px)] right-0 z-[60] min-w-[184px] rounded-[9px] border border-line bg-panel p-1 shadow-menu"
        >
          {rest.map((app) => (
            <button
              key={app.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded-md px-2 py-[7px] text-left font-sans text-xs leading-none font-medium text-fg2 hover:bg-panel2 hover:text-fg"
              onClick={() => open(app.id)}
            >
              Open in {app.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
