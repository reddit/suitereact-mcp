import CancelIcon from '@mui/icons-material/Cancel';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ColumnsPanelTrigger,
  ExportCsv,
  ExportPrint,
  FilterPanelTrigger,
  QuickFilter,
  QuickFilterClear,
  QuickFilterControl,
  QuickFilterTrigger,
  Toolbar,
  ToolbarButton,
} from '@mui/x-data-grid';
import * as React from 'react';

import {
  NsReactButtonProps,
  NsReactFormGridElementProps,
  NsReactHandleActionInputProps,
} from '../../domain';
import NsReactButton from '../NsReactButton';
import NsReactDataGridPagination from '../NsReactDataGridPagination';

const StyledQuickFilter = styled(QuickFilter)({
  display: 'grid',
  alignItems: 'center',
});

interface OwnerState {
  expanded: boolean;
}

const StyledToolbarButton = styled(ToolbarButton as React.ComponentType, {
  shouldForwardProp: prop => prop !== 'ownerState',
})<{ ownerState: OwnerState } & React.PropsWithChildren>(
  ({ theme, ownerState }) => ({
    gridArea: '1 / 1',
    width: 'min-content',
    height: 'min-content',
    zIndex: 1,
    opacity: ownerState.expanded ? 0 : 1,
    pointerEvents: ownerState.expanded ? 'none' : 'auto',
    transition: theme.transitions.create(['opacity']),
  })
);

const StyledTextField = styled(TextField)<{
  ownerState: { expanded: boolean };
}>(({ theme, ownerState }) => ({
  gridArea: '1 / 1',
  overflowX: 'clip',
  width: ownerState.expanded ? 260 : 'var(--trigger-width)',
  opacity: ownerState.expanded ? 1 : 0,
  transition: theme.transitions.create(['width', 'opacity']),
}));

const XlsxExportMenuItem = (props: {
  tableId: string;
  handleAction: (props: NsReactHandleActionInputProps) => Promise<any>;
  exportFileName?: string;
}) => {
  return (
    <MenuItem
      onClick={async () => {
        await props.handleAction({
          actionProps: { action: 'downloadExcelFileFromTable' },
          inputData: { tableId: props.tableId, fileName: props.exportFileName },
        });
      }}
    >
      Download as XLSX
    </MenuItem>
  );
};

export default function NsReactDataGridToolbar(props: {
  tableId: string;
  formElements: NsReactFormGridElementProps[];
  handleAction: (props: NsReactHandleActionInputProps) => Promise<any>;
  rowCount: number;
  rowsPerPageOptions: number[];
  hideToolbar: boolean;
  title?: string;
  actionButtons?: NsReactButtonProps[];
  exportFileName?: string;
}) {
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const exportMenuTriggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Toolbar>
      {props.title && (
        <Typography fontWeight="medium" sx={{ flex: 1, mx: 0.5 }}>
          {props.title}
        </Typography>
      )}

      {!props.hideToolbar && (
        <>
          <NsReactDataGridPagination
            rowCount={props.rowCount}
            rowsPerPageOptions={props.rowsPerPageOptions}
          />

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Columns">
            <ColumnsPanelTrigger render={<ToolbarButton />}>
              <ViewColumnIcon fontSize="small" />
            </ColumnsPanelTrigger>
          </Tooltip>

          <Tooltip title="Filters">
            <FilterPanelTrigger
              render={({ onClick, ref, ...props }, state) => (
                <ToolbarButton
                  ref={ref as React.Ref<HTMLButtonElement>}
                  onClick={onClick}
                  color="default"
                  {...props}
                >
                  <Badge
                    badgeContent={state.filterCount}
                    color="primary"
                    variant="dot"
                  >
                    <FilterListIcon fontSize="small" />
                  </Badge>
                </ToolbarButton>
              )}
            />
          </Tooltip>

          <Divider
            orientation="vertical"
            variant="middle"
            flexItem
            sx={{ mx: 0.5 }}
          />

          <Tooltip title="Export">
            <ToolbarButton
              ref={exportMenuTriggerRef}
              id="export-menu-trigger"
              aria-controls="export-menu"
              aria-haspopup="true"
              aria-expanded={exportMenuOpen ? 'true' : undefined}
              onClick={() => setExportMenuOpen(true)}
            >
              <FileDownloadIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Menu
            id="export-menu"
            anchorEl={exportMenuTriggerRef.current}
            open={exportMenuOpen}
            onClose={() => setExportMenuOpen(false)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              list: {
                'aria-labelledby': 'export-menu-trigger',
              },
            }}
          >
            <ExportCsv
              render={<MenuItem />}
              onClick={() => setExportMenuOpen(false)}
              options={{ fileName: props.exportFileName }}
            >
              Download as CSV
            </ExportCsv>
            <XlsxExportMenuItem
              tableId={props.tableId}
              handleAction={props.handleAction}
              exportFileName={props.exportFileName}
            />
            <ExportPrint
              render={<MenuItem />}
              onClick={() => setExportMenuOpen(false)}
            >
              Print
            </ExportPrint>
          </Menu>

          <StyledQuickFilter debounceMs={500}>
            <QuickFilterTrigger
              render={(triggerProps, state) => (
                <Tooltip title="Search" enterDelay={0}>
                  <StyledToolbarButton
                    {...triggerProps}
                    ownerState={{ expanded: state.expanded }}
                    aria-disabled={state.expanded}
                  >
                    <SearchIcon fontSize="small" />
                  </StyledToolbarButton>
                </Tooltip>
              )}
            />
            <QuickFilterControl
              render={({ ref, ...controlProps }, state) => (
                <StyledTextField
                  {...controlProps}
                  ownerState={{ expanded: state.expanded }}
                  inputRef={ref}
                  aria-label="Search"
                  placeholder="Search..."
                  size="small"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: state.value ? (
                        <InputAdornment position="end">
                          <QuickFilterClear
                            edge="end"
                            size="small"
                            aria-label="Clear search"
                          >
                            <CancelIcon fontSize="small" />
                          </QuickFilterClear>
                        </InputAdornment>
                      ) : null,
                      ...controlProps.slotProps?.input,
                    },
                    ...controlProps.slotProps,
                  }}
                />
              )}
            />
          </StyledQuickFilter>

          {props.actionButtons &&
            props.actionButtons.map(
              (button: NsReactButtonProps, index: number) => (
                <NsReactButton
                  key={index}
                  id={button.buttonId}
                  label={button.label}
                  onClick={button.onClick}
                  formElements={props.formElements}
                  handleAction={props.handleAction}
                  params={button.params}
                />
              )
            )}
        </>
      )}

      {props.hideToolbar && props.actionButtons && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {props.actionButtons.map(
            (button: NsReactButtonProps, index: number) => (
              <NsReactButton
                key={index}
                id={button.buttonId}
                label={button.label}
                onClick={button.onClick}
                formElements={props.formElements}
                handleAction={props.handleAction}
                params={button.params}
              />
            )
          )}
        </Box>
      )}
    </Toolbar>
  );
}
