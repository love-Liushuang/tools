import ToolPageShell from '../components/ToolPageShell';

function FileEncryptPage() {
  return (
    <ToolPageShell
      title="文件加密/解密（本地）"
      desc="AES-256-GCM + PBKDF2，所有操作在本地浏览器完成，文件不会上传服务器。"
    >
      <div className="tool-embed-shell">
        <iframe
          className="tool-embed-frame"
          src="/jiamimao/index.html"
          title="文件加密/解密"
          loading="lazy"
        />
      </div>
    </ToolPageShell>
  );
}

export default FileEncryptPage;

