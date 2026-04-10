# BoxTools 视频下载助手

本地浏览器插件源码，给 `video-download` 工具补充“目标页面上下文 + 浏览器网络层”捕获能力。

适用场景：

- Bilibili 页面里的 DASH 音视频地址提取
- 微信公众号、普通网页里播放器真实发起的媒体请求捕获
- 不走本站服务器，也不依赖第三方解析接口

## 加载方式

1. 打开 Chrome / Edge 的扩展程序页面
2. 打开“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择当前目录 `browser-extension/video-download-assistant`

## 使用方式

1. 打开目标视频网页
2. 如果没有立即出现结果，先播放一次视频
3. 点击扩展图标，查看候选地址
4. 点“复制导出 JSON”
5. 回到网站里的 `视频链接下载（前端优先）` 页面，粘贴 JSON 后继续分析或本地合并

## 当前实现

- `background.js`
  负责按标签页收集网络层媒体请求，并向弹窗提供结果
- `content-generic.js`
  负责采集 `<video>`、`<source>`、`performance` 资源和脚本文本里的候选地址
- `content-bilibili-main.js`
  负责在 Bilibili 主页面上下文里拦截 `__playinfo__` 与 `playurl` 请求，提取 DASH 音视频信息

## 说明

- 直链/HLS 可以尝试直接下载
- Bilibili DASH 推荐导回网站工具页，在浏览器内本地封装成 MP4
- 如果目标站有额外鉴权、DRM 或强防盗链，是否能直接下载仍取决于目标站策略
