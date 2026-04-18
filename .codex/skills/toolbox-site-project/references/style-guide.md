# Style Guide

## Naming and file layout

- React pages use `PascalCase` filenames ending with `Page.jsx`
- Shared components use `PascalCase`
- Client helper files use `camelCase.js`
- Tool ids and route segments use `kebab-case`
- User-facing text is mostly Chinese and should stay concise and practical

## React patterns used in this repo

- Use function components
- Prefer `useState` for local state
- Use `useMemo` for derived lists or expensive derived values when it helps readability or avoids repeated work
- Use `useEffect` for side effects and cleanup
- Keep small pure helpers near the top of the file
- Move logic into `client/src/lib/` only when it is algorithmic, reused, or large enough to deserve separation

## UI and shared component reuse

- Default tool layout should use `ToolPageShell`
  - it already provides the page container
  - the header uses `.tool-page` and `.tool-head`
  - the content card uses `.tool-card`
  - it includes the return-home button and `PageNotice`
- Use `ToastProvider` through `useToast()` for success and error feedback
- Reuse `copyText` from `client/src/lib/tool.js` instead of reimplementing clipboard logic
- Check existing global classes in `client/src/styles.css` before creating new ones
  - common patterns include `.tool-page`, `.tool-card`, `.actions`, `.field-label`, button classes, and list/grid cards

## Visual direction

- Preserve the current light, rounded, gradient-based visual language
- Prefer simple, readable layouts over decorative complexity
- Avoid introducing a second design system inside one tool unless the existing tool already does that intentionally
- If page-specific CSS is needed, keep selectors scoped and minimal

## Architecture boundaries

- Prefer browser-first implementations for local tools
- Add backend endpoints only when browser APIs are insufficient or the existing feature pattern already depends on `/api/*`
- Keep Express handlers direct and focused; avoid building framework-like layers for small features
- Do not add abstractions early
  - avoid new shared hooks, contexts, helper layers, or config systems unless the same pattern is already repeated
  - prefer one clear local implementation over a reusable system that is only used once

## Change discipline

- When adding a tool, wire both the registry and the route
- When removing a tool, clean both the tool list and route imports
- When editing parsing or conversion logic, test against a realistic sample input, not only mocked strings
- When copy or labels appear in more than one place, unify the source instead of duplicating wording

## Validation checklist

- There is no dedicated automated test suite in the repo today
- Minimum verification after frontend work:
  - run `npm run build` from the repo root
- When server code changes:
  - run `npm run build`
  - add a focused syntax or behavior check relevant to the edited endpoint
- When tool logic depends on real files or text input:
  - run at least one realistic local sample through the updated flow
- If a check cannot be run, call that out explicitly in the final handoff
