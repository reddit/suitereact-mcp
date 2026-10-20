export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  customStyle?: React.CSSProperties;
}

class ToastService {
  private listeners: ((toast: ToastMessage) => void)[] = [];

  subscribe(listener: (toast: ToastMessage) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(toast: ToastMessage) {
    this.listeners.forEach(listener => listener(toast));
  }

  showSuccess(message: string, duration?: number) {
    this.notify({ message, type: 'success', duration });
  }

  showError(message: string, duration?: number) {
    this.notify({ message, type: 'error', duration });
  }

  showWarning(message: string, duration?: number) {
    this.notify({ message, type: 'warning', duration });
  }

  showInfo(message: string, duration?: number) {
    this.notify({ message, type: 'info', duration });
  }
}

// Create a singleton instance
export const toastService = new ToastService();
