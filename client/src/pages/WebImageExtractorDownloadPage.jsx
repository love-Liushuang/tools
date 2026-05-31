import ToolPageShell from '../components/ToolPageShell';

const DOWNLOAD_URL = 'https://abigbook.craft.me/op44jdbJcBUPPx';

const FEATURES = [
  '输入地址，提取页面渲染后的图片地址。',
  '支持下载图片，并保存 image-urls.txt 与失败清单。'
];

function WebImageExtractorDownloadPage() {
  return (
    <ToolPageShell
      title="网页图片提取器"
      desc="下载桌面端应用，在本地提取网页中的图片并批量保存。"
    >
      <div className="desktop-download-page">
        <section className="desktop-download-hero">
          <div>
            <p className="desktop-download-tag">桌面端应用</p>
            <h2>网页图片提取器</h2>
            <p>
              提取正文区域图片，适合需要批量保存网页图片的场景。
            </p>
          </div>
          <div className="desktop-download-badge">
            Windows / macOS
          </div>
        </section>

        <section className="desktop-download-panel" aria-label="桌面端下载">
          <div>
            <h3>下载桌面端应用</h3>
          </div>
          <a
            className="desktop-download-button"
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
          >
            前往下载页面
          </a>
        </section>

        <section className="desktop-download-info">
          <h3>功能说明</h3>
          <ul>
            {FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
      </div>
    </ToolPageShell>
  );
}

export default WebImageExtractorDownloadPage;
