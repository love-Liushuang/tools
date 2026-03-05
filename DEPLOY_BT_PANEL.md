# 宝塔面板部署步骤（Node 项目）

## 1. 上传项目

将整个项目上传到服务器目录，例如：`/www/wwwroot/toolbox-site`

## 2. 安装依赖并构建

在宝塔终端进入项目目录执行：

```bash
cd /www/wwwroot/toolbox-site
npm install
npm --prefix client install
npm run build
```

## 3. 启动 Node 服务

可用 PM2（推荐）：

```bash
npm install -g pm2
pm2 start server/index.js --name toolbox-api --env production
pm2 save
```

默认端口是 `3000`，可通过环境变量修改：

```bash
PORT=3100 pm2 start server/index.js --name toolbox-api --env production
```

## 4. 配置宝塔网站反向代理

1. 在宝塔新建站点（例如 `tools.yourdomain.com`）
2. 进入站点设置 -> 反向代理 -> 添加反向代理
3. 目标 URL 填写：`http://127.0.0.1:3000`（或你的自定义端口）
4. 开启后保存

这样外部访问域名，实际上由 Nginx 转发给 Node 服务。

## 5. 更新发布

每次更新代码后执行：

```bash
cd /www/wwwroot/toolbox-site
npm install
npm --prefix client install
npm run build
pm2 restart toolbox-api
```
