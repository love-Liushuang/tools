import React from 'react';

function ChangelogPage () {
    const entries = [
        {
            version: 'v1.12.1',
            date: '2026-04-16',
            items: [
                '修复bug：PDF电子发票批量重命名功能：普通发票命名一些缺少字段。',
            ],
        },
        {
            version: 'v1.12.0',
            date: '2026-04-15',
            items: [
                'PDF 电子发票批量重命名 功能上线：支持按发票字段自定义文件名（示例：开票日期、发票金额、发票号码、销售方名称）。',
                '规则设置弹窗：可按发票类型（普通 / 火车 / 飞机）配置字段、顺序与分隔符，并实时预览重命名结果。',
                '支持拖拽调整字段顺序（拖动把手）、字段启用/禁用与自定义文案；配置持久化到 localStorage。',
                '兼容性处理：保留旧接口，自动识别“全部启用”的老配置以展示推荐默认字段（不自动覆盖已保存配置）。',
            ],
        },
        {
            version: 'v1.11.0',
            date: '2026-04-11',
            items: [
                '微信公众号封面获取 功能上线：输入文章链接可提取并下载封面图片，支持常见文章域名解析与文件名规范化。',
            ],
        },
        {
            version: 'v1.10.0',
            date: '2026-04-06',
            items: [
                '视频转 GIF / WebP（单线程）：新增单文件处理的转换功能，提供常用参数预设与尺寸限制。',
            ],
        },
        {
            version: 'v1.9.0',
            date: '2026-03-31',
            items: [
                '视频转 GIF / WebP（多线程）：新增并行转换能力，使用 WebWorker/多实例 FFmpeg 提升批量转换性能（视浏览器与环境能力）。',
            ],
        },
        {
            version: 'v1.8.1',
            date: '2026-03-27',
            items: [
                'Emoji 页面性能优化：对大列表采用分页加载，显著提升首屏渲染与滚动体验。',
            ],
        },
        {
            version: 'v1.8.0',
            date: '2026-03-23',
            items: [
                '新增 Emoji 全量列表与专题合集：按主题浏览与筛选，便于查找与复制表情。',
            ],
        },
        {
            version: 'v1.7.0',
            date: '2026-03-21',
            items: [
                '文件 MD5 批量计算：支持拖拽多文件并同时计算校验值，便于文件完整性校验与核对。',
            ],
        },
        {
            version: 'v1.6.0',
            date: '2026-03-19',
            items: [
                '网页整页截图：支持完整页面滚动截取并导出图片，适用于长文档或页面存档。',
            ],
        },
        {
            version: 'v1.5.0',
            date: '2026-03-15',
            items: [
                '实时热点聚合：新增热点聚合展示。',
                'Markdown 在线编辑器：Markdown 编辑器提供即时预览与导出功能。',
            ],
        },
        {
            version: 'v1.4.0',
            date: '2026-03-14',
            items: [
                '种子转磁力链接：解析 .torrent 并生成 magnet 链接，方便分享与使用。',
            ],
        },
        {
            version: 'v1.3.0',
            date: '2026-03-12',
            items: [
                '文件加密 / 解密（本地）：在浏览器端进行对称加密与解密，文件不出本地，适合敏感文件处理。',
            ],
        },
        {
            version: 'v1.2.0',
            date: '2026-03-11',
            items: [
                '工具集更新：JSON 工具大全（格式化/压缩/验证）',
                '工具集更新：SVG 图片预览',
                '工具集更新：SVG 转 Base64',
                '工具集更新：SVG Path 预览',
                '工具集更新：文本内容对比',
            ],
        },
        {
            version: 'v1.1.0',
            date: '2026-03-08',
            items: [
                '在线图片转换：支持多种图片格式互转（含 WebP/PNG/JPEG）与简单压缩参数。',
            ],
        },
        {
            version: 'v1.0.0',
            date: '2026-03-06',
            items: [
                '基础工具集合上线：PDF 解密',
                '基础工具集合上线：文本加密为字母',
                '基础工具集合上线：Base64 编解码',
                '基础工具集合上线：文本统计等实用小工具',
            ],
        },
    ];

    return (
        <main className="tool-page">
            <section className="tool-card">
                <h2 style={{ fontSize: 28 }}>更新日志</h2>
                <div style={{ marginTop: 12 }}>
                    {entries.map((e) => (
                        <div key={e.version} style={{ marginBottom: 18 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                                <strong style={{ fontSize: 24 }}>{e.version}</strong>
                                <span style={{ color: '#66788f' }}>{e.date}</span>
                            </div>
                            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                                {e.items.map((it, idx) => (
                                    <li key={idx} style={{ marginBottom: 6 }}>{it}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}

export default ChangelogPage;
