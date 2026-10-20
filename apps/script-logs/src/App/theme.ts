import { createTheme } from '@mui/material';

/** App-specific semantic tokens; keep raw colors here rather than in views. */
export const tokens = {
  border: '#e1e6ef',
  borderStrong: '#cfd7e4',
  chrome: '#17243b',
  chromeText: '#d8e3f5',
  chromeMuted: '#9fb0cc',
  selected: '#edf2ff',
  selectedRail: '#4260d5',
  warningText: '#8a5300',
  warningBg: '#fff4e0',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  severity: {
    ERROR: '#b33c38',
    EMERGENCY: '#8534a1',
    AUDIT: '#23796a',
    DEBUG: '#617087',
  } as Record<string, string>,
  code: {
    surface: '#142137',
    surfaceRaised: '#1b2b45',
    border: '#24375a',
    text: '#dbe5f5',
    muted: '#8ea3c4',
    key: '#a8c7ff',
    string: '#ade2bd',
    number: '#f4c783',
    nil: '#d2b5f5',
    container: '#a4b6cf',
    selected: '#20324c',
    match: '#283d58',
    activeMatch: '#3a5580',
    focus: '#a8c7ff',
  },
};

export const severityColor = (severity: string) =>
  tokens.severity[severity] || tokens.severity.DEBUG;

export const theme = createTheme({
  palette: {
    primary: { main: '#4260d5' },
    background: { default: '#f4f6fa', paper: '#ffffff' },
    text: { primary: '#1c2940', secondary: '#5d6b82' },
    divider: tokens.border,
  },
  typography: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    h6: { fontSize: '1rem', fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { sizeSmall: { fontSize: 13 } },
    },
    MuiIconButton: {
      styleOverrides: {
        sizeSmall: { padding: 6, borderRadius: 6 },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiInputBase: { styleOverrides: { input: { fontSize: 14 } } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTooltip: {
      defaultProps: { enterDelay: 400, disableInteractive: true },
      styleOverrides: { tooltip: { fontSize: 12 } },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
  },
});
