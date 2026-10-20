import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';

import { tokens } from '../../App/theme';
import {
  formatMoney,
  hasAmount,
  missingAmountCount,
  plural,
  totalsByCurrency,
} from '../format';
import type {
  ApprovalOutcome,
  PendingTransaction,
  TransactionTypeOption,
} from '../types';

const PREVIEW = 6;

function Row({ row, message }: { row: PendingTransaction; message?: string }) {
  return (
    <Box sx={{ py: 0.75, borderTop: `1px solid ${tokens.border}` }}>
      <Stack direction="row" gap={1.5} alignItems="baseline">
        <Typography
          fontFamily={tokens.mono}
          fontSize={12.5}
          fontWeight={600}
          sx={{ flex: 1, minWidth: 0 }}
          noWrap
        >
          {row.tranid || `#${row.id}`}
        </Typography>
        <Typography
          fontSize={12.5}
          fontWeight={600}
          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {hasAmount(row)
            ? formatMoney(row.amount, row.currency)
            : 'Amount unavailable'}
        </Typography>
      </Stack>
      <Typography
        fontSize={12.5}
        color={message ? 'error.main' : 'text.secondary'}
        sx={{ overflowWrap: 'anywhere' }}
      >
        {message || row.entity || row.memo || 'No name or memo'}
      </Typography>
    </Box>
  );
}

export default function ApproveDialog({
  open,
  rows,
  type,
  run,
  onCancel,
  onDone,
}: {
  open: boolean;
  rows: PendingTransaction[];
  type: TransactionTypeOption;
  run: (
    rows: PendingTransaction[],
    onProgress: (done: number) => void
  ) => Promise<ApprovalOutcome>;
  onCancel: () => void;
  onDone: (outcome: ApprovalOutcome) => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [done, setDone] = useState(0);
  const [outcome, setOutcome] = useState<ApprovalOutcome | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setDone(0);
      setOutcome(null);
    }
  }, [open]);

  const count = rows.length;
  const noun = plural(count, type.singular, type.label);
  const totals = totalsByCurrency(rows);
  const missing = missingAmountCount(rows);
  const start = async () => {
    setPhase('running');
    const result = await run(rows, setDone);
    setOutcome(result);
    setPhase('done');
  };
  const finish = () => {
    if (outcome) onDone(outcome);
  };

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      aria-labelledby="approve-title"
      disableEscapeKeyDown={phase === 'running'}
      slotProps={{
        transition: { onEntered: () => cancelRef.current?.focus() },
      }}
      onClose={() => {
        if (phase === 'confirm') onCancel();
        else if (phase === 'done') finish();
      }}
    >
      {phase === 'confirm' && (
        <>
          <DialogTitle id="approve-title">Approve {noun}?</DialogTitle>
          <DialogContent>
            <Stack direction="row" gap={3} flexWrap="wrap" mb={1.5}>
              {totals.map(total => (
                <Box key={total.currency}>
                  <Typography variant="caption" color="text.secondary">
                    {total.count.toLocaleString()} in{' '}
                    {total.currency || 'no currency'}
                  </Typography>
                  <Typography
                    fontWeight={700}
                    fontSize={18}
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatMoney(total.amount, total.currency)}
                  </Typography>
                </Box>
              ))}
            </Stack>
            {missing > 0 && (
              <Alert severity="info" role="note" sx={{ mb: 1.5 }}>
                Totals exclude {plural(missing, 'transaction', 'transactions')}{' '}
                whose amount isn&apos;t available. Open them in NetSuite to
                review the amount before approving.
              </Alert>
            )}
            <Box>
              {rows.slice(0, PREVIEW).map(row => (
                <Row key={row.id} row={row} />
              ))}
              {count > PREVIEW && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ pt: 0.75, borderTop: `1px solid ${tokens.border}` }}
                >
                  and {(count - PREVIEW).toLocaleString()} more
                </Typography>
              )}
            </Box>
            <Alert severity="warning" role="note" sx={{ mt: 2 }}>
              Each transaction&apos;s approval status will be set to Approved in
              NetSuite. This can&apos;t be undone from this app.
            </Alert>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onCancel} ref={cancelRef} autoFocus>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => void start()}
            >
              Approve {noun}
            </Button>
          </DialogActions>
        </>
      )}
      {phase === 'running' && (
        <>
          <DialogTitle id="approve-title">Approving {noun}…</DialogTitle>
          <DialogContent>
            <LinearProgress
              variant="determinate"
              color="success"
              value={count ? (done / count) * 100 : 0}
              aria-label="Approval progress"
              sx={{ height: 8, borderRadius: 4, mb: 1 }}
            />
            <Typography variant="body2" role="status">
              {done.toLocaleString()} of {count.toLocaleString()} processed.
              Keep this window open until it finishes.
            </Typography>
          </DialogContent>
        </>
      )}
      {phase === 'done' && outcome && (
        <>
          <DialogTitle id="approve-title">
            {outcome.failed.length === 0
              ? `${plural(outcome.approved.length, type.singular, type.label)} approved`
              : `${outcome.approved.length.toLocaleString()} approved, ${outcome.failed.length.toLocaleString()} failed`}
          </DialogTitle>
          <DialogContent>
            {outcome.failed.length === 0 ? (
              <Alert severity="success" role="status">
                Approved transactions were removed from the queue and added to
                this session&apos;s approval log.
              </Alert>
            ) : (
              <>
                <Alert severity="error" role="alert" sx={{ mb: 1.5 }}>
                  {outcome.failed.length === 1
                    ? "One transaction couldn't be approved. It's still selected so you can review it and retry."
                    : `${outcome.failed.length.toLocaleString()} transactions couldn't be approved. They're still selected so you can review them and retry.`}
                </Alert>
                <Box sx={{ maxHeight: 240, overflow: 'auto' }}>
                  {outcome.failed.map(({ row, message }) => (
                    <Row key={row.id} row={row} message={message} />
                  ))}
                </Box>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="contained" onClick={finish} autoFocus>
              Done
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
