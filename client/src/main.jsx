import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdBlockNotice from './components/AdBlockNotice';
import { ToastProvider } from './components/ToastProvider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
      <AdBlockNotice />
    </ToastProvider>
  </React.StrictMode>
);
