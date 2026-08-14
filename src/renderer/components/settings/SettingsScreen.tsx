import { useWorkspace } from "../../store/WorkspaceProvider";
import type { Theme } from "../../types";
import { AgentSettingsSection } from "./AgentSettingsSection";
import { SettingsSection } from "./SettingsSection";

const THEME_OPTIONS: { id: Theme; label: string; swatch: string }[] = [
  { id: "dark", label: "Dark", swatch: "oklch(0.17 0.008 95)" },
  { id: "light", label: "Light", swatch: "oklch(0.97 0.004 95)" },
];

const OPTION_ON = "border-line bg-panel2 text-fg";
const OPTION_OFF = "border-lines bg-transparent text-fg3 hover:border-line";

export function SettingsScreen() {
  const { isAllScope, activeProject, theme, setTheme, goToScreen } = useWorkspace();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-[26px] px-8 pt-7 pb-[60px]">
        <div>
          <h1 className="m-0 font-sans text-lg leading-[1.2] font-semibold tracking-[-0.015em]">
            Settings
          </h1>
          <div className="mt-1 font-sans text-[12.5px] leading-[1.5] font-normal text-fg3">
            Workspace preferences for {isAllScope ? "all repositories" : activeProject?.repo} and
            every project you orchestrate.
          </div>
        </div>

        <AgentSettingsSection />

        <SettingsSection title="Appearance">
          <div className="flex flex-col gap-4 px-4 py-[14px]">
            <div>
              <div className="mb-[9px] font-sans text-xs leading-none font-medium text-fg2">
                Theme
              </div>
              <div className="flex gap-2">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`flex-1 rounded-[9px] border px-3 py-[11px] text-left ${
                      theme === option.id ? OPTION_ON : OPTION_OFF
                    }`}
                    onClick={() => setTheme(option.id)}
                  >
                    <span
                      className="mb-[9px] block h-[26px] rounded-[5px] border border-lines"
                      style={{ background: option.swatch }}
                    />
                    <span className="font-sans text-xs leading-none font-medium">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsSection>

        <button
          type="button"
          className="self-start rounded-lg border border-lines px-[14px] py-[9px] font-sans text-[12.5px] leading-none font-medium text-fg2 hover:border-line hover:text-fg"
          onClick={() => goToScreen("board")}
        >
          Back to board
        </button>
      </div>
    </div>
  );
}
