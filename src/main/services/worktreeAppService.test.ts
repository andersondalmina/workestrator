import { describe, expect, it } from "vitest";
import { entriesFor } from "./worktreeAppService";

describe("entriesFor", () => {
  it("offers Finder first, then Terminal, then the editors", () => {
    expect(entriesFor("darwin").map((entry) => entry.id)).toEqual(["finder", "terminal", "vscode"]);
  });

  it("lists the apps the OS ships without needing them found", () => {
    const always = entriesFor("darwin")
      .filter((entry) => entry.always)
      .map((entry) => entry.id);
    expect(always).toEqual(["finder", "terminal"]);
  });

  it("has nothing for a platform no app has been written for yet", () => {
    expect(entriesFor("win32")).toEqual([]);
    expect(entriesFor("linux")).toEqual([]);
  });
});

describe("entry commands", () => {
  const entry = (id: string) => {
    const found = entriesFor("darwin").find((candidate) => candidate.id === id);
    if (!found) throw new Error(`No ${id} entry`);
    return found;
  };

  it("hands the folder straight to the OS for Finder", () => {
    expect(entry("finder").command(null, "/tmp/pr-7")).toEqual({
      file: "open",
      args: ["/tmp/pr-7"],
    });
  });

  it("opens the bundle it was found at", () => {
    expect(entry("vscode").command("/Applications/Visual Studio Code.app", "/tmp/pr-7")).toEqual({
      file: "open",
      args: ["-a", "/Applications/Visual Studio Code.app", "/tmp/pr-7"],
    });
  });

  it("falls back to the app's name when no bundle was found", () => {
    expect(entry("terminal").command(null, "/tmp/pr-7")).toEqual({
      file: "open",
      args: ["-a", "Terminal", "/tmp/pr-7"],
    });
  });

  // The path is the last argument and never part of one, so a folder name can
  // never be read as a flag or as a second command.
  it("keeps the worktree a single argument of its own", () => {
    const args = entry("vscode").command(null, "/tmp/pr 7 --new-window");
    expect(args.args.at(-1)).toBe("/tmp/pr 7 --new-window");
    expect(args.args).toHaveLength(3);
  });
});
