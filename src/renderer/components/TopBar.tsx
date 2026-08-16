import { APP_VERSION } from "../data/board";
import { useIsMac } from "../hooks/usePlatform";
import { useWorkspace } from "../store/WorkspaceProvider";
import { PlusIcon, RefreshIcon, ThemeIcon } from "./icons";

export function TopBar() {
  const { fetchBusy, fetchPullRequests, toggleTheme, openComposer } = useWorkspace();
  const isMac = useIsMac();

  return (
    <header
      // The window has no native title bar, so this strip drags it — and on
      // macOS the left padding clears the traffic lights.
      className={`wk-drag-strip flex h-[54px] flex-none items-center gap-[14px] border-b border-lines bg-panel pr-[14px] ${
        isMac ? "pl-[82px]" : "pl-4"
      }`}
    >
      <div className="flex flex-none items-center gap-[9px] whitespace-nowrap">
        <div className="flex size-[22px] items-center justify-center rounded-md bg-btn font-mono text-[11px] leading-none font-medium text-btnfg">
          W
        </div>
        <div className="font-sans text-sm leading-none font-bold tracking-[-0.01em]">
          Workestrator
        </div>
        <div className="rounded border border-lines px-[5px] py-[3px] font-mono text-[9.5px] leading-none font-normal text-fg4">
          {APP_VERSION}
        </div>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        className={`flex flex-none items-center gap-[7px] rounded-lg border border-lines bg-card py-2 pr-[11px] pl-[9px] font-sans text-[12.5px] leading-none font-medium whitespace-nowrap text-fg2 ${
          fetchBusy
            ? "animate-wk-pulse cursor-default"
            : "hover:border-line hover:bg-cardh hover:text-fg"
        }`}
        onClick={fetchPullRequests}
        disabled={fetchBusy}
        title="Fetch open pull requests from every project with gh and glab"
      >
        <RefreshIcon size={14} color="var(--fg3)" />
        <span>{fetchBusy ? "Fetching…" : "Fetch PRs"}</span>
      </button>

      <button
        type="button"
        className="flex size-8 flex-none items-center justify-center rounded-lg border border-lines bg-card hover:border-line hover:bg-cardh"
        onClick={toggleTheme}
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <ThemeIcon size={15} color="var(--fg2)" />
      </button>

      <button
        type="button"
        className="flex flex-none items-center gap-[7px] rounded-lg bg-btn py-2 pr-[13px] pl-[10px] font-sans text-[12.5px] leading-none font-semibold whitespace-nowrap text-btnfg hover:opacity-[0.88]"
        onClick={openComposer}
      >
        <PlusIcon size={14} strokeWidth={1.8} />
        <span>New PR</span>
      </button>
    </header>
  );
}
