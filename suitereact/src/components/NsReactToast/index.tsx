import { Alert, Snackbar } from '@mui/material';
import * as React from 'react';

export interface NsReactToastProps {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  open: boolean;
  onClose: () => void;
  customStyle?: React.CSSProperties;
}

export default function NsReactToast(props: NsReactToastProps) {
  const { message, type, duration = 6000, open, onClose, customStyle } = props;

  const handleClose = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === 'clickaway') {
      return;
    }
    onClose();
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={customStyle}
    >
      <Alert onClose={handleClose} severity={type} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
}

// Export context and utilities
export type { Toast } from './ToastContext';
export { ToastProvider, useToast } from './ToastContext';
export type { ToastMessage } from './ToastService';
export { toastService } from './ToastService';
export { useToastHelpers } from './useToastHelpers';
