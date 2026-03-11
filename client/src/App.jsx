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
import NotFoundPage from './pages/NotFoundPage';

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
          <Route path="svg-base64" element={<Navigate to="/tools/svg-base64" replace />} />
          <Route path="SVG转Base64" element={<Navigate to="/tools/svg-base64" replace />} />
          <Route path="svg-path" element={<Navigate to="/tools/svg-path" replace />} />
          <Route path="SVG路径预览" element={<Navigate to="/tools/svg-path" replace />} />
          <Route path="svg-preview" element={<Navigate to="/tools/svg-preview" replace />} />
          <Route path="SVG预览" element={<Navigate to="/tools/svg-preview" replace />} />
          <Route path="SVG图片预览" element={<Navigate to="/tools/svg-preview" replace />} />
          <Route path="tools/json-formatter" element={<JsonFormatterPage />} />
          <Route path="tools/base64" element={<Base64Page />} />
          <Route path="tools/text-stats" element={<TextStatsPage />} />
          <Route path="tools/text-letter" element={<TextLetterPage />} />
          <Route path="tools/txt-diff" element={<TextDiffPage />} />
          <Route path="tools/unlock-pdf" element={<UnlockPdfPage />} />
          <Route path="tools/image-convert" element={<ImageConvertPage />} />
          <Route path="tools/svg-base64" element={<SvgBase64Page />} />
          <Route path="tools/svg-path" element={<SvgPathPage />} />
          <Route path="tools/svg-preview" element={<SvgPreviewPage />} />
          <Route path="tools" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
