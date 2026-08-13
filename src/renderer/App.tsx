import { useCallback } from "react";
import { BoardScreen } from "./components/board/BoardScreen";
import { ComposerDialog } from "./components/composer/ComposerDialog";
import { TaskPanel } from "./components/panel/TaskPanel";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Toast } from "./components/ui/Toast";
import { useEscapeKey } from "./hooks/useEscapeKey";
import { useWorkspace, WorkspaceProvider } from "./store/WorkspaceProvider";

function Shell() {
  const {
    screen,
    selectedTask,
    composerOpen,
    addProjectError,
    fetchNotice,
    reviewError,
    closeTask,
    closeComposer,
    dismissAddProjectError,
    dismissFetchNotice,
    dismissReviewError,
  } = useWorkspace();

  // Escape dismisses the topmost layer first.
  const dismiss = useCallback(() => {
    if (composerOpen) closeComposer();
    else closeTask();
  }, [composerOpen, closeComposer, closeTask]);

  useEscapeKey(composerOpen || selectedTask !== null, dismiss);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col bg-bg">
          {screen === "board" ? <BoardScreen /> : <SettingsScreen />}
          {selectedTask && <TaskPanel task={selectedTask} />}
          {composerOpen && <ComposerDialog />}

          {(fetchNotice || addProjectError || reviewError) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex flex-col items-center gap-2">
              {fetchNotice && (
                <Toast
                  message={fetchNotice.message}
                  tone={fetchNotice.tone}
                  onDismiss={dismissFetchNotice}
                />
              )}
              {addProjectError && (
                <Toast message={addProjectError} onDismiss={dismissAddProjectError} />
              )}
              {reviewError && <Toast message={reviewError} onDismiss={dismissReviewError} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
