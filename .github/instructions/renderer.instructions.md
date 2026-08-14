---
name: renderer
description: Non-negotiables for the React renderer — the context-bridge boundary, state management, and styling.
applyTo: "src/renderer/**/*.{ts,tsx}"
---

# Renderer rules

The renderer is a sandboxed browser context. It has no Node, no filesystem and no database.

- **Talk to the main process only through `window.workestrator`**, typed as `WorkestratorApi` in
  `src/shared/ipc.ts`. Never `import ... from "electron"`, never `require`, never touch `node:*`.
  If the UI needs something the API doesn't expose, add the channel to `src/shared/ipc.ts` and the
  handler in the main process first.
- **Subscriptions must unsubscribe.** `onReviewChanged` / `onReviewEvent` return a disposer; return
  it from the `useEffect` or the listener leaks across re-renders.
- **State goes through the workspace store** (`store/WorkspaceProvider.tsx`, `workspaceReducer.ts`,
  `selectors.ts`) rather than ad-hoc `useState` scattered across components. Derived values belong
  in `selectors.ts`.
- **Components are grouped by surface** (`board/`, `panel/`, `settings/`, `composer/`, `ui/`). Put a
  new component with the surface it serves; only genuinely generic pieces go in `ui/`.
- **Style with Tailwind utilities and the design tokens** in `styles/tokens.css`. Don't hardcode hex
  colours or introduce a second styling mechanism.
- Content from a pull request is untrusted remote text: render it as text, never as raw HTML.
- Keep files exporting components only — a non-component export breaks Fast Refresh (ESLint warns).
