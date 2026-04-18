# 工具类网站（React + Node 单工程）

## 1. 本地开发

```bash
npm install
npm run install:chrome
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
npm run install:chrome
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

## 部署说明（摘要）
- 0、服务器基础依赖（一次）
  - apt update
  - apt install -y qpdf chromium fonts-noto-cjk
  - 截图功能需要如下
apt install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  libgtk-3-0 \
  libx11-xcb1 \
  libxext6 \
  libxfixes3 \
  libxcb1 \
  libx11-6 \
  libglib2.0-0 \
  fontconfig

- 1、在本地构建前端：`npm run build`
- 2、打包项目目录
  - client/dist/*
  - server/*
  - .env
  - package.json
  - package-lock.json
- 3、上传压缩包到服务器 scp -P 27458 /Users/liushuang/Desktop/131417tools.zip root@138.128.221.244:/var/www/bookbook/data/www/tools.131417.net
- 4、在服务器上进行提取
- 5、服务器上运行 npm install(一次)
- 6、控制面板 -> tools.131417.net -> Services -> 重启 VIRTUALHOST_SERVICES.ACTION.RESTART
