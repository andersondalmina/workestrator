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

export const APP_VERSION = "1.0.0";
