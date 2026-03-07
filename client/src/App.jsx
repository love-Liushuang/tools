import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SiteLayout from './components/SiteLayout';
import HomePage from './pages/HomePage';
import JsonFormatterPage from './pages/JsonFormatterPage';
import Base64Page from './pages/Base64Page';
import TextStatsPage from './pages/TextStatsPage';
import TextLetterPage from './pages/TextLetterPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="text-letter" element={<Navigate to="/tools/text-letter" replace />} />
          <Route path="文本加密为字母" element={<Navigate to="/tools/text-letter" replace />} />
          <Route path="tools/json-formatter" element={<JsonFormatterPage />} />
          <Route path="tools/base64" element={<Base64Page />} />
          <Route path="tools/text-stats" element={<TextStatsPage />} />
          <Route path="tools/text-letter" element={<TextLetterPage />} />
          <Route path="tools" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
