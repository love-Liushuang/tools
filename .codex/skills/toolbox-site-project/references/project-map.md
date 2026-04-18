# Project Map / 项目地图

## Repo Shape / 仓库结构

- Root package name / 根包名: `toolbox-site`
- Frontend / 前端: `client/`，使用 React 18 + Vite + React Router
- Backend / 后端: `server/index.js`，使用 Express
- Root scripts / 根目录常用命令:
  - `npm run dev` -> 同时启动 server 和 client
  - `npm run build` -> 构建 `client/`
  - `npm start` -> 用 Node 启动生产服务
- Client scripts / 前端常用命令:
  - `npm --prefix client run dev`
  - `npm --prefix client run build`

## Main Integration Points / 主要接入点

- Tool registry / 工具注册表: `client/src/data/tools.js`
  - category list / 分类列表
  - tool card metadata / 工具卡片元数据
  - featured tool ids / 常用工具配置
- Route wiring / 路由接线: `client/src/App.jsx`
  - imports page components / 引入页面组件
  - defines `/tools/*` routes / 定义工具路由
  - holds alias redirects / 保存别名跳转
- Shared layout and chrome / 共享布局与外壳:
  - `client/src/components/SiteLayout.jsx`
  - `client/src/components/ToolPageShell.jsx`
  - `client/src/components/PageNotice.jsx`
  - `client/src/components/ToastProvider.jsx`
- Shared client helpers / 前端共享工具:
  - `client/src/lib/tool.js` 提供 `copyText`
  - 其它工具型 helper 放在 `client/src/lib/*`
- Global styling / 全局样式: `client/src/styles.css`
- Changelog page / 更新日志页: `client/src/pages/ChangelogPage.jsx`

## Current Tool Inventory / 当前工具清单

### Dev / 开发工具

- `json-formatter` -> `/tools/json-formatter`

### Encode / 编码转换

- `base64` -> `/tools/base64`
- `file-encrypt` -> `/tools/file-encrypt`
- `torrent-magnet` -> `/tools/torrent-magnet`
- `md5` -> `/tools/md5`

### Text / 文本处理

- `text-stats` -> `/tools/text-stats`
- `markdown-editor` -> `/tools/markdown-editor`
- `text-letter` -> `/tools/text-letter`
- `txt-diff` -> `/tools/txt-diff`

### WPS / 办公文档

- `unlock-pdf` -> `/tools/unlock-pdf`

### Invoice / 发票工具

- `invoice-pdf-rename` -> `/tools/invoice-pdf-rename`

### Image / 图片处理

- `image-convert` -> `/tools/image-convert`
- `getgzhtoutu` -> `/tools/getgzhtoutu`
- `svg-base64` -> `/tools/svg-base64`
- `svg-path` -> `/tools/svg-path`
- `svg-preview` -> `/tools/svg-preview`
- `webshot` -> `/tools/webshot`

### Video / 视频处理

- `video-to-gif` -> `/tools/video-to-gif`
- `video-to-gif-single` -> `/tools/video-to-gif-single`

### Emoji / 表情工具

- `emoji-list` -> `/tools/emoji`
- `emoji-topics` -> `/tools/emoji/topics`

### Special Pages / 特殊页面

- Home page / 首页: `/`
- Hot trends page / 热点页: `/hot`
- Changelog page / 更新日志: `/tools/changelog`
- Not found page / 404 页面: `client/src/pages/NotFoundPage.jsx`

## Common Files By Task Type / 按任务查看常改文件

### Add Or Remove A Tool / 新增或删除工具

- `client/src/data/tools.js`
- `client/src/App.jsx`
- `client/src/pages/<ToolName>Page.jsx`
- `client/src/lib/<toolHelper>.js`，需要时新增
- `client/src/styles.css` 或工具自己的页面样式文件
- `client/src/pages/ChangelogPage.jsx`，如果这次改动需要记更新日志

### Update An Existing Tool / 修改已有工具

- 先从 `client/src/pages/` 里的页面文件开始
- 如果页面用了 `client/src/lib/` 下的 helper，一并阅读
- 新增 CSS 前先检查 `styles.css` 是否已有可复用类名

### Server-Backed Features / 依赖服务端的功能

- `server/index.js`
- 调用 `/api/*` 的前端页面或 helper

## Notable Routing Detail / 路由注意点

- `InvoiceRenamePage` 在 `client/src/App.jsx` 中是懒加载
- 其它大多数页面是直接 import
- 别名跳转保持显式、可读，不要过度抽象
