# 工具类网站（React + Node 单工程）

## 1. 本地开发

```bash
npm install
npm --prefix client install
npm run dev
```

- 前端开发地址：`http://localhost:5173`
- 后端开发地址：`http://localhost:3000`

## 2. 页面路由

- `/`：工具首页（分类导航）
- `/tools/json-formatter`：JSON 格式化
- `/tools/base64`：Base64 编解码
- `/tools/text-stats`：文本统计
- `/tools/text-letter`：文本加密为字母
- `/tools/unlock-pdf`：PDF 解密
- `/tools/image-convert`：在线图片转换

## 3. 生产运行

```bash
npm install
npm --prefix client install
npm run build
npm start
```

生产环境由 Node 服务 `client/dist` 静态文件，并提供 `/api/*` 接口。

## 4. 项目结构

```text
.
├─ client/                # React 前端
│  └─ src/
│     ├─ components/
│     ├─ pages/
│     └─ data/
├─ server/
│  └─ index.js            # Node/Express 后端
└─ package.json           # 根脚本（统一启动）
```
