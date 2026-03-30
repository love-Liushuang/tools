import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

function ToastViewport({ toasts }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={toast.tone === 'error' ? 'toast-item is-error' : 'toast-item is-success'}
          role="status"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(0);
  const timerMapRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));

    const timer = timerMapRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timerMapRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message, options = {}) => {
    if (!message) {
      return null;
    }

    nextIdRef.current += 1;
    const id = nextIdRef.current;
    const duration = options.duration ?? 2200;
    const tone = options.tone === 'error' ? 'error' : 'success';

    setToasts((prev) => [...prev, { id, message, tone }]);

    const timer = window.setTimeout(() => {
      removeToast(id);
    }, duration);

    timerMapRef.current.set(id, timer);
    return id;
  }, [removeToast]);

  useEffect(() => {
    return () => {
      timerMapRef.current.forEach((timer) => window.clearTimeout(timer));
      timerMapRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({
    showToast,
    success(message, options) {
      return showToast(message, { ...options, tone: 'success' });
    },
    error(message, options) {
      return showToast(message, { ...options, tone: 'error' });
    }
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }

  return context;
}
