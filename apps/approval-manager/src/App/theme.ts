import { alpha, createTheme } from '@mui/material';

/**
 * Semantic tokens. Primary is a neutral cobalt for navigation and selection;
 * green is reserved for the approve action and approved outcomes so the
 * consequential action is never confused with ordinary chrome.
 */
export const tokens = {
  border: '#e3e8f0',
  surfaceMuted: '#f7f9fc',
  selected: '#eef2fd',
  pending: '#b45309',
  pendingBg: '#fff7e6',
  approve: '#1e7a46',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#3555c8' },
    success: { main: tokens.approve },
    warning: { main: tokens.pending },
    background: { default: '#f4f6fa', paper: '#ffffff' },
    text: { primary: '#14213d', secondary: '#5b6b84' },
    divider: tokens.border,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    fontSize: 13,
    h6: { fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600, fontSize: '0.8125rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: tokens.border },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTooltip: {
      defaultProps: { enterDelay: 400, disableInteractive: true },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 44,
          '&.Mui-selected': { color: '#14213d' },
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiDialog: {
      styleOverrides: {
        paper: { boxShadow: `0 24px 48px ${alpha('#14213d', 0.18)}` },
      },
    },
  },
});
