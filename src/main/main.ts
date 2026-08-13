import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import { createMainWindow } from "./window";
import { closeDatabase, failInterruptedReviews, openDatabase } from "./db";
import { registerIpcHandlers } from "./ipc";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

app.on("ready", () => {
  // Opened up front so a broken database fails at startup rather than on the
  // first project the user tries to add.
  openDatabase();
  // Reviews only run for as long as the app does, so any that were still going
  // last time it closed ended there.
  failInterruptedReviews();
  registerIpcHandlers();
  createMainWindow();
});

app.on("will-quit", closeDatabase);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window when the dock icon is clicked
  // and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
