import { alpha, createTheme } from '@mui/material';

const BRAND = '#0a3d62';
const BRAND_DARK = '#073050';
const ACCENT = '#3c6382';
const SURFACE = '#ffffff';
const BG = '#f6f8fb';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: BRAND, dark: BRAND_DARK },
    secondary: { main: ACCENT },
    background: { default: BG, paper: SURFACE },
    text: {
      primary: '#0f172a',
      secondary: '#5a6478',
    },
    divider: alpha('#94a3b8', 0.2),
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, fontSize: '0.8125rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, padding: '6px 16px' },
        containedPrimary: {
          background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #051f33 100%)`,
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha('#94a3b8', 0.18)}`,
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
  },
});
