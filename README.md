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

- 1、在本地构建前端：`npm run build`
- 2、打包项目目录
  - client/dist/*
  - server/*
  - package.json
  - package-lock.json
- 3、上传压缩包到服务器 scp -P 27458 /Users/liushuang/Desktop/131417tools.zip root@138.128.221.244:/var/www/bookbook/data/www/tools.131417.net
- 4、在服务器上进行提取
- 5、服务器上运行 npm install(一次)
- 5.1、如果启用了网页截图功能，再运行 `npm run install:chrome`
- 6、控制面板 -> tools.131417.net -> Services -> 重启 VIRTUALHOST_SERVICES.ACTION.RESTART

## Puppeteer / Chrome 部署说明

- 网页截图功能依赖 Puppeteer 对应版本的 Chrome for Testing。
- 项目运行时默认把浏览器缓存放在项目目录下的 `.cache/puppeteer`。
- 首次部署或清空缓存后，请在项目根目录执行：

```bash
npm run install:chrome
```

- 如果服务器已经安装了系统 Chrome，也可以设置环境变量：

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

- 如果部署面板执行 `npm install` 时忽略了依赖脚本，截图接口会在运行时提示缺少 Chrome，此时手工执行上面的安装命令即可。
