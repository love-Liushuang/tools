---
name: toolbox-site-project
description: Use when working on the toolbox-site React + Node tool collection repo (工具站集合) to add, update, remove, or debug tools, routes, shared components, client utilities, or simple server endpoints while preserving the repo's existing architecture, naming, styling, and lightweight implementation style.
---

# Toolbox Site Project

Use this skill for repo-local work inside the current toolbox-site project. Favor direct solutions that reuse the existing page shell, shared styles, and utility helpers. Do not introduce extra abstraction unless the pattern is already repeated or the new layer will clearly reduce duplication right away.

## Quick start

1. Identify the affected tool or page and read only the nearby files first.
2. For discoverability changes, check both `client/src/data/tools.js` and `client/src/App.jsx`.
3. Reuse shared components and global styles before creating new wrappers or patterns.
4. Keep user-facing copy concise and consistent with the surrounding Chinese wording.
5. Run local verification before finishing.

## Workflow

1. Start from the integration points:
   - tool registry: `client/src/data/tools.js`
   - routing and page imports: `client/src/App.jsx`
   - shared layout: `client/src/components/*`
   - page logic: `client/src/pages/*`
   - reusable helpers: `client/src/lib/*`
   - server/API work: `server/index.js`
2. For a tool page, use `ToolPageShell` by default unless the tool already has a justified custom layout.
3. Keep helpers local to the page unless they are algorithmic, reused, or large enough to deserve `client/src/lib`.
4. Prefer browser-side implementation first. Add or extend server code only when the browser cannot do the job well or the repo already uses a server-backed pattern for that feature.
5. Make targeted edits instead of broad refactors.
6. Validate with the relevant build and task-specific checks.

## Reference map

- Read `references/project-map.md` when you need the current tool inventory, repo layout, or the usual files to touch for a feature.
- Read `references/style-guide.md` when you need the repo's naming, component reuse, architecture boundaries, or verification checklist.

## Quality rules

- Match the existing React + Node code style, not generic boilerplate.
- Reuse current classes, buttons, cards, notices, and toast behavior before inventing new UI patterns.
- Keep logic readable and direct. Avoid new global state, deep utility layers, or speculative abstractions.
- When a change affects tool entry, category, or navigation, verify registry and route wiring together.
- When a change touches parsing, conversion, or file-processing logic, verify with realistic sample input whenever possible.
- Default verification is `npm run build` from the repo root. If the task touches server logic or standalone scripts, add a focused syntax or behavior check too.
