import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useWorkspace, type ProjectSummary } from "../store/WorkspaceProvider";
import {
  CloseIcon,
  FolderIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  TrashIcon,
} from "./icons";

interface NavItemProps {
  icon: ReactNode;
  label: string;
  /** Font utilities for the label; defaults to the sans row style. */
  labelFont?: string;
  countFont?: string;
  active: boolean;
  onClick: () => void;
  count?: string;
  dot?: boolean;
  /** True while the row's menu is open, which keeps the count hidden. */
  menuOpen?: boolean;
}

/** Shared row used by All PRs, each project and Settings. */
function NavItem({
  icon,
  label,
  labelFont = "font-sans text-[12.5px] leading-none",
  countFont = "text-[11px]",
  active,
  onClick,
  count,
  dot,
  menuOpen = false,
}: NavItemProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-[9px] rounded-[7px] p-2 text-left hover:bg-panel2 ${
        active ? "bg-panel2" : "bg-transparent"
      }`}
      onClick={onClick}
    >
      <span className="flex w-[14px] flex-none justify-center">{icon}</span>
      <span
        className={`flex-1 truncate font-medium ${labelFont} ${active ? "text-fg" : "text-fg2"}`}
      >
        {label}
      </span>
      {dot && <span className="size-[6px] flex-none rounded-full bg-orange" />}
      {count !== undefined && (
        <span
          className={`font-mono leading-none font-normal text-fg4 ${countFont} ${
            menuOpen ? "opacity-0" : "group-hover/row:opacity-0"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface ProjectRowProps {
  project: ProjectSummary;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSelect: () => void;
  onDelete: () => void;
}

/**
 * A project row with its options menu. The menu button sits on top of the row
 * rather than inside it, so the row stays a single button, and the menu closes
 * on Escape or on a click anywhere outside it.
 */
function ProjectRow({
  project,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onSelect,
  onDelete,
}: ProjectRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEscapeKey(menuOpen, onCloseMenu);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) onCloseMenu();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen, onCloseMenu]);

  return (
    <div ref={rowRef} className="group/row relative">
      <NavItem
        icon={<FolderIcon size={14} color={project.icon} />}
        label={project.repo}
        labelFont="font-mono text-[12.5px] leading-[1.2]"
        countFont="text-[10.5px]"
        active={project.isActive}
        onClick={onSelect}
        count={String(project.openCount)}
        dot={project.hasBlocked}
        menuOpen={menuOpen}
      />

      <button
        type="button"
        className={`absolute top-1/2 right-[5px] size-[22px] -translate-y-1/2 items-center justify-center rounded-md border border-lines bg-card text-fg3 hover:border-line hover:text-fg ${
          menuOpen ? "flex" : "hidden group-hover/row:flex"
        }`}
        title="Project options"
        aria-label={`Options for ${project.repo}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <MoreIcon size={13} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="animate-wk-pop absolute top-[calc(100%+2px)] right-1 z-[60] min-w-[164px] rounded-[9px] border border-line bg-panel p-1 shadow-menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-[9px] rounded-md px-2 py-[7px] text-left font-sans text-xs leading-none font-medium text-red hover:bg-panel2"
            onClick={onDelete}
          >
            <TrashIcon size={13} />
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const {
    query,
    setQuery,
    clearQuery,
    isAllScope,
    screen,
    allTaskCount,
    projectSummaries,
    selectScope,
    goToScreen,
    addProject,
    addProjectBusy,
    removeProject,
  } = useWorkspace();

  /** The project whose options menu is open, if any. */
  const [menuProject, setMenuProject] = useState<string | null>(null);

  const allActive = isAllScope && screen === "board";

  return (
    <aside className="flex w-[238px] flex-none flex-col border-r border-lines bg-panel">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-transparent bg-sunken px-[9px] py-[7px] focus-within:border-line">
          <SearchIcon size={13} color="var(--fg4)" />
          <input
            className="w-full min-w-0 font-sans text-[12.5px] leading-none font-normal"
            placeholder="Search tasks, PRs, branches"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.length > 0 && (
            <button
              type="button"
              className="flex flex-none"
              onClick={clearQuery}
              aria-label="Clear search"
            >
              <CloseIcon size={12} color="var(--fg3)" />
            </button>
          )}
        </div>
      </div>

      <div className="px-2 pt-[2px] pb-[10px]">
        <NavItem
          icon={<span className="size-2 rotate-45 rounded-[2px] bg-fg3" />}
          label="All PRs"
          active={allActive}
          onClick={() => selectScope("all")}
          count={String(allTaskCount)}
        />
      </div>

      <div className="mx-3 mb-3 h-px bg-lines" />

      <div className="flex items-center justify-between px-[14px] pb-2">
        <span className="font-sans text-[10.5px] leading-none font-medium tracking-[0.07em] text-fg4 uppercase">
          Projects
        </span>
        <button
          type="button"
          className={`flex text-fg4 ${
            addProjectBusy ? "animate-wk-pulse cursor-default" : "hover:text-fg"
          }`}
          aria-label="Add project"
          title="Add a project from a folder on this computer"
          onClick={addProject}
          disabled={addProjectBusy}
        >
          <PlusIcon size={13} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-px overflow-y-auto px-2 pb-3">
        {projectSummaries.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            menuOpen={menuProject === project.id}
            onToggleMenu={() => setMenuProject((open) => (open === project.id ? null : project.id))}
            onCloseMenu={() => setMenuProject((open) => (open === project.id ? null : open))}
            onSelect={() => selectScope(project.id)}
            onDelete={() => {
              setMenuProject(null);
              removeProject(project.id);
            }}
          />
        ))}
      </nav>

      <div className="border-t border-lines p-2">
        <NavItem
          icon={<SlidersIcon size={15} color="var(--fg3)" />}
          label="Settings"
          active={screen === "settings"}
          onClick={() => goToScreen("settings")}
        />
      </div>
    </aside>
  );
}
