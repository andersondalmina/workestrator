// Named import so the bundler tree-shakes to just the version string rather
// than inlining all of package.json.
import { version } from "../../../package.json";

import type { Column, Tone } from "../types";

export const COLUMNS: Column[] = [
  {
    id: "working",
    name: "Working",
    color: "var(--blue)",
    emptyText: "No agent is running here.",
  },
  {
    id: "needs",
    name: "Needs you",
    color: "var(--orange)",
    emptyText: "Nothing blocked on you.",
  },
  {
    id: "review",
    name: "In review",
    color: "var(--violet)",
    emptyText: "No open reviews.",
  },
  {
    id: "merge",
    name: "Ready to merge",
    color: "var(--green)",
    emptyText: "Nothing queued to merge.",
  },
];

export const TONE: Record<Tone, string> = {
  blue: "var(--blue)",
  orange: "var(--orange)",
  violet: "var(--violet)",
  green: "var(--green)",
  red: "var(--red)",
  fg: "var(--fg3)",
};

export const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "mine", label: "Assigned to me" },
  { id: "failing", label: "Failing checks" },
] as const;

// Read from package.json so the badge never drifts from the shipped version.
export const APP_VERSION = version;
