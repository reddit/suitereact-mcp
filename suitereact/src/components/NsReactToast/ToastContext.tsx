import * as React from 'react';

import NsReactToast from './index';
import { ToastMessage, toastService } from './ToastService';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  customStyle?: React.CSSProperties;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(
  undefined
);

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearToasts = React.useCallback(() => {
    setToasts([]);
  }, []);

  // Subscribe to toast service
  React.useEffect(() => {
    const unsubscribe = toastService.subscribe((toastMessage: ToastMessage) => {
      addToast(toastMessage);
    });
    return unsubscribe;
  }, [addToast]);

  const value = React.useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      clearToasts,
    }),
    [toasts, addToast, removeToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.map(toast => (
        <NsReactToast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          open={true}
          onClose={() => removeToast(toast.id)}
          customStyle={toast.customStyle}
        />
      ))}
    </ToastContext.Provider>
  );
};
