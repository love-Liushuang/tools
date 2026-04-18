# Style Guide / 风格约定

## Naming And File Layout / 命名与文件布局

- React 页面文件使用 `PascalCase`，并以 `Page.jsx` 结尾
- 共享组件使用 `PascalCase`
- 前端 helper 文件使用 `camelCase.js`
- 工具 id 和路由片段使用 `kebab-case`
- 面向用户的文案以中文为主，保持简洁、直接、实用

## React Patterns Used In This Repo / 当前仓库的 React 写法

- 使用函数组件
- 局部状态优先用 `useState`
- 当有助于可读性或避免重复计算时，使用 `useMemo` 处理派生数据
- 副作用和清理逻辑使用 `useEffect`
- 小型纯函数 helper 放在文件顶部附近
- 只有当逻辑算法性强、被复用、或明显变大时，才抽到 `client/src/lib/`

## UI And Shared Component Reuse / UI 与共享组件复用

- 工具页默认使用 `ToolPageShell`
  - 自带页面容器
  - 头部复用 `.tool-page` 和 `.tool-head`
  - 内容卡片复用 `.tool-card`
  - 已内置返回首页按钮和 `PageNotice`
- 成功/失败提示优先通过 `ToastProvider` + `useToast()` 完成
- 复制能力复用 `client/src/lib/tool.js` 里的 `copyText`
- 新增样式前先看 `client/src/styles.css` 是否已有可复用类名
  - 常见复用点包括 `.tool-page`、`.tool-card`、`.actions`、`.field-label`、按钮类和列表/网格卡片类

## Visual Direction / 视觉方向

- 保持当前明亮、圆角、渐变感的视觉语言
- 布局优先清晰易读，不要为了“设计感”增加无效复杂度
- 除非工具本身已经有特殊视觉体系，否则不要在单个工具里再造第二套设计系统
- 如果必须写页面级 CSS，选择器要收敛、作用域要小

## Architecture Boundaries / 架构边界

- 本地工具优先浏览器侧实现
- 只有当浏览器 API 不够用，或当前功能本来就依赖 `/api/*` 时，才新增后端接口
- Express handler 保持直接、聚焦，不要为小功能搭框架式分层
- 不要过早抽象
  - 除非模式已经重复出现，否则不要轻易新增 shared hook、context、helper 层或配置系统
  - 一个清晰的本地实现，通常比“只用一次的复用系统”更合适

## Change Discipline / 改动纪律

- 新增工具时，同时接好 registry 和 route
- 删除工具时，同时清理工具列表和路由 import
- 修改解析或转换逻辑时，用真实样例测试，不只看 mock 文本
- 同一份文案如果出现在多个地方，尽量统一来源，不要重复硬编码

## Validation Checklist / 验证清单

- 当前仓库还没有单独的自动化测试套件
- 前端改动后的最低验证要求：
  - 在仓库根目录执行 `npm run build`
- 如果改了服务端代码：
  - 先执行 `npm run build`
  - 再补一个与改动接口相关的语法或行为检查
- 如果工具逻辑依赖真实文件或文本输入：
  - 至少跑一遍真实本地样例
- 如果有检查没法执行，必须在最终交付说明里明确讲出来
