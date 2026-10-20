import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Box,
  Drawer,
  IconButton,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import dayjs from 'dayjs';

import { tokens } from '../../App/theme';
import { formatMoney } from '../format';
import type { ApprovedEntry } from '../types';
import { buildRecordUrl } from './columns';

export default function SessionLog({
  open,
  entries,
  templates,
  onClose,
}: {
  open: boolean;
  entries: ApprovedEntry[];
  templates: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 400 } } } }}
    >
      <Stack
        direction="row"
        alignItems="center"
        sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.border}` }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="h2">
            Approved this session
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Kept in this browser tab only. NetSuite record history is the system
            of record.
          </Typography>
        </Box>
        <IconButton aria-label="Close approval log" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      {entries.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          Nothing approved yet in this session.
        </Typography>
      ) : (
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {entries.map(entry => {
            const template = templates[entry.recordtype];
            return (
              <Stack
                component="li"
                key={`${entry.id}-${entry.approvedAt}`}
                direction="row"
                gap={1.5}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: `1px solid ${tokens.border}`,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {template ? (
                    <Link
                      href={buildRecordUrl(template, entry.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      sx={{
                        fontFamily: tokens.mono,
                        fontWeight: 600,
                        fontSize: 13,
                        display: 'inline-flex',
                        gap: 0.5,
                        alignItems: 'center',
                      }}
                    >
                      {entry.tranid}
                      <OpenInNewIcon sx={{ fontSize: 13 }} />
                    </Link>
                  ) : (
                    <Typography
                      fontFamily={tokens.mono}
                      fontWeight={600}
                      fontSize={13}
                    >
                      {entry.tranid}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    noWrap
                  >
                    {[entry.type, entry.entity].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography
                    fontSize={13}
                    fontWeight={600}
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatMoney(entry.amount, entry.currency)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(entry.approvedAt).format('h:mm A')}
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Box>
      )}
    </Drawer>
  );
}
