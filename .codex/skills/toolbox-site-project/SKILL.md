---
name: toolbox-site-project
description: Use when working on the toolbox-site React + Node tool collection repo (工具站集合). 当用户在这个工具站项目中新增、修改、删除工具，修复 bug，调整路由、页面、共享组件、客户端工具函数或简单后端接口，并希望保持现有架构、命名、样式和轻量实现风格时，使用这个技能。
---

# Toolbox Site Project / 工具站项目

Use this skill for repo-local work inside the current toolbox-site project.
这个技能用于当前 toolbox-site 工具站仓库内的开发与维护。

Favor direct solutions that reuse the existing page shell, shared styles, and utility helpers.
优先复用现有页面壳、共享样式和工具函数，不要为了“更通用”而过度抽象。

## Quick Start / 快速开始

1. Identify the affected tool or page and read the nearby files first.
   先从受影响工具或页面附近的文件开始读，不要一上来就做全局改动。
2. For discoverability or navigation changes, check both `client/src/data/tools.js` and `client/src/App.jsx`.
   只要涉及工具入口、可发现性或导航，就同时检查 `tools.js` 和 `App.jsx`。
3. Reuse shared components and global styles before creating new wrappers.
   优先复用共享组件和全局样式，再考虑新建封装。
4. Keep user-facing copy concise and aligned with the repo's existing Chinese tone.
   页面文案以中文为主，保持简洁、直接，和现有页面语气一致。
5. Run local verification before finishing.
   收尾前必须做本地验证。

## Workflow / 工作方式

1. Start from these integration points:
   先从这些接入点入手：
   - tool registry: `client/src/data/tools.js`
   - routing and page imports: `client/src/App.jsx`
   - shared layout: `client/src/components/*`
   - page logic: `client/src/pages/*`
   - reusable helpers: `client/src/lib/*`
   - server/API work: `server/index.js`
2. Use `ToolPageShell` by default for tool pages unless the existing tool has a justified custom layout.
   工具页默认走 `ToolPageShell`，除非已有明确的自定义布局理由。
3. Keep small helpers local to the page. Move logic to `client/src/lib` only when it is reused, algorithmic, or clearly large enough.
   页面内的小辅助逻辑优先就地放；只有当逻辑复用、算法性强或明显变大时，再抽到 `client/src/lib`。
4. Prefer browser-side implementation first. Extend server code only when browser capabilities are insufficient or the repo already follows a server-backed pattern for that feature.
   优先浏览器侧实现。只有浏览器做不好，或者仓库已有 `/api/*` 模式时，才扩展服务端。
5. Make targeted edits instead of broad refactors.
   以定点修改为主，不做顺手大重构。
6. Validate with the relevant build and task-specific checks.
   根据改动范围做构建和针对性验证。

## Reference Map / 参考文件

- Read `references/project-map.md` when you need the current tool inventory, repo layout, or the usual files to touch for a feature.
  需要看当前工具清单、仓库结构、常见改动入口时，读 `references/project-map.md`。
- Read `references/style-guide.md` when you need the repo's naming, component reuse, architecture boundaries, or verification checklist.
  需要看命名习惯、组件复用、架构边界和验证清单时，读 `references/style-guide.md`。

## Quality Rules / 质量约定

- Match the existing React + Node code style, not generic boilerplate.
  代码风格要贴合当前仓库，而不是套一层通用脚手架写法。
- Reuse current classes, buttons, cards, notices, and toast behavior before inventing new UI patterns.
  先复用现有类名、按钮、卡片、提示区和 toast 交互，不要轻易发明新 UI 模式。
- Keep logic readable and direct. Avoid new global state, deep utility layers, or speculative abstractions.
  逻辑要直白、好读，避免新增全局状态、很深的工具层或“以后可能用得上”的抽象。
- When a change affects tool entry, category, or navigation, verify registry and route wiring together.
  涉及工具入口、分类或导航时，要同时验证 registry 和 route。
- When a change touches parsing, conversion, or file-processing logic, verify with realistic sample input whenever possible.
  涉及解析、转换、文件处理时，尽量用真实样例验证，而不是只看 mock 数据。
- Default verification is `npm run build` from the repo root. If the task touches server logic or standalone scripts, add a focused syntax or behavior check too.
  默认验证是仓库根目录执行 `npm run build`；如果改了服务端或脚本，再补充对应的语法或行为检查。
