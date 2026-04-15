import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SiteLayout from './components/SiteLayout';
import HomePage from './pages/HomePage';
import JsonFormatterPage from './pages/JsonFormatterPage';
import Base64Page from './pages/Base64Page';
import TextStatsPage from './pages/TextStatsPage';
import TextLetterPage from './pages/TextLetterPage';
import TextDiffPage from './pages/TextDiffPage';
import UnlockPdfPage from './pages/UnlockPdfPage';
import ImageConvertPage from './pages/ImageConvertPage';
import SvgBase64Page from './pages/SvgBase64Page';
import SvgPathPage from './pages/SvgPathPage';
import SvgPreviewPage from './pages/SvgPreviewPage';
import WebshotPage from './pages/WebshotPage';
import VideoToGifPage from './pages/VideoToGifPage';
import VideoToGifSinglePage from './pages/VideoToGifSinglePage';
import FileEncryptPage from './pages/FileEncryptPage';
import TorrentMagnetPage from './pages/TorrentMagnetPage';
import MarkdownEditorPage from './pages/MarkdownEditorPage';
import HotTrendsPage from './pages/HotTrendsPage';
import Md5Page from './pages/Md5Page';
import EmojiListPage from './pages/EmojiListPage';
import EmojiTopicsPage from './pages/EmojiTopicsPage';
import EmojiTopicDetailPage from './pages/EmojiTopicDetailPage';
import WechatCoverPage from './pages/WechatCoverPage';
import NotFoundPage from './pages/NotFoundPage';
import ChangelogPage from './pages/ChangelogPage';

const InvoiceRenamePage = lazy(() => import('./pages/InvoiceRenamePage'));

function LazyPage({ children }) {
  return (
    <Suspense
      fallback={(
        <main className="tool-page">
          <section className="tool-card">页面加载中...</section>
        </main>
      )}
    >
      {children}
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="text-letter" element={<Navigate to="/tools/text-letter" replace />} />
          <Route path="文本加密为字母" element={<Navigate to="/tools/text-letter" replace />} />
          <Route path="txt-diff" element={<Navigate to="/tools/txt-diff" replace />} />
          <Route path="文本对比" element={<Navigate to="/tools/txt-diff" replace />} />
          <Route path="unlock-pdf" element={<Navigate to="/tools/unlock-pdf" replace />} />
          <Route path="pdf-unlock" element={<Navigate to="/tools/unlock-pdf" replace />} />
          <Route path="PDF解密" element={<Navigate to="/tools/unlock-pdf" replace />} />
          <Route path="invoice-pdf-rename" element={<Navigate to="/tools/invoice-pdf-rename" replace />} />
          <Route path="电子发票批量重命名" element={<Navigate to="/tools/invoice-pdf-rename" replace />} />
          <Route path="svg-base64" element={<Navigate to="/tools/svg-base64" replace />} />
          <Route path="SVG转Base64" element={<Navigate to="/tools/svg-base64" replace />} />
          <Route path="svg-path" element={<Navigate to="/tools/svg-path" replace />} />
          <Route path="SVG路径预览" element={<Navigate to="/tools/svg-path" replace />} />
          <Route path="svg-preview" element={<Navigate to="/tools/svg-preview" replace />} />
          <Route path="SVG预览" element={<Navigate to="/tools/svg-preview" replace />} />
          <Route path="SVG图片预览" element={<Navigate to="/tools/svg-preview" replace />} />
          <Route path="tools/json-formatter" element={<JsonFormatterPage />} />
          <Route path="tools/base64" element={<Base64Page />} />
          <Route path="tools/file-encrypt" element={<FileEncryptPage />} />
          <Route path="tools/text-stats" element={<TextStatsPage />} />
          <Route path="tools/text-letter" element={<TextLetterPage />} />
          <Route path="tools/txt-diff" element={<TextDiffPage />} />
          <Route path="tools/unlock-pdf" element={<UnlockPdfPage />} />
          <Route
            path="tools/invoice-pdf-rename"
            element={(
              <LazyPage>
                <InvoiceRenamePage />
              </LazyPage>
            )}
          />
          <Route path="tools/image-convert" element={<ImageConvertPage />} />
          <Route path="tools/changelog" element={<ChangelogPage />} />
          <Route path="tools/svg-base64" element={<SvgBase64Page />} />
          <Route path="tools/svg-path" element={<SvgPathPage />} />
          <Route path="tools/svg-preview" element={<SvgPreviewPage />} />
          <Route path="tools/webshot" element={<WebshotPage />} />
          <Route path="tools/getgzhtoutu" element={<WechatCoverPage />} />
          <Route path="tools/video-to-gif" element={<VideoToGifPage />} />
          <Route path="tools/video-to-gif-single" element={<VideoToGifSinglePage />} />
          <Route path="tools/torrent-magnet" element={<TorrentMagnetPage />} />
          <Route path="tools/markdown-editor" element={<MarkdownEditorPage />} />
          <Route path="tools/md5" element={<Md5Page />} />
          <Route path="tools/emoji" element={<EmojiListPage />} />
          <Route path="tools/emoji/topics" element={<EmojiTopicsPage />} />
          <Route path="tools/emoji/topics/:topicId" element={<EmojiTopicDetailPage />} />
          <Route path="hot" element={<HotTrendsPage />} />
          <Route path="tools" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
