import { alpha, createTheme } from '@mui/material';

/**
 * Semantic tokens shared with the other SuiteReact workbench apps. SuiteQL Bot
 * keeps purple, matching its NetSuite icon, as the single action and selection
 * accent; warning and error carry result completeness and failures.
 */
export const tokens = {
  border: '#e3e8f0',
  surfaceMuted: '#f7f9fc',
  selected: '#f6edfa',
  text: '#14213d',
  textMuted: '#5b6b84',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

const PRIMARY = '#7b1fa2';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: PRIMARY },
    warning: { main: '#b45309' },
    background: { default: '#f4f6fa', paper: '#ffffff' },
    text: { primary: tokens.text, secondary: tokens.textMuted },
    divider: tokens.border,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    fontSize: 13,
    h6: { fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 700, fontSize: '0.9375rem' },
    subtitle2: { fontWeight: 600, fontSize: '0.8125rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontVariantNumeric: 'tabular-nums' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${tokens.border}`,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: { boxShadow: `0 12px 32px ${alpha(tokens.text, 0.14)}` },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { boxShadow: `0 12px 32px ${alpha(tokens.text, 0.14)}` },
      },
    },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiTooltip: {
      defaultProps: { enterDelay: 400, disableInteractive: true },
    },
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          color: tokens.textMuted,
          borderColor: tokens.border,
          '&.Mui-selected': {
            color: PRIMARY,
            backgroundColor: tokens.selected,
            '&:hover': { backgroundColor: alpha(PRIMARY, 0.14) },
          },
        },
      },
    },
  },
});
