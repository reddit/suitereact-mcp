import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import * as React from 'react';

import { dsSetUserDefaultSpace } from '../actions/clientActions';
import type { Space } from '../types';

interface Props {
  spaces: Space[];
  currentDefaultId: string | null;
  onChanged: () => void | Promise<void>;
}

export function UserPrefsView({
  spaces,
  currentDefaultId,
  onChanged,
}: Props): React.ReactElement {
  const [selectedId, setSelectedId] = React.useState<string>(
    currentDefaultId ?? ''
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedId(currentDefaultId ?? '');
  }, [currentDefaultId]);

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await dsSetUserDefaultSpace({
        spaceId: selectedId === '' ? null : selectedId,
      });
      setInfo('Saved.');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        My preferences
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {info}
        </Alert>
      )}
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <TextField
            label="Default landing space"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            select
            helperText="Opens automatically when you launch the app."
          >
            <MenuItem value="">— None —</MenuItem>
            {spaces
              .filter(s => !s.archived)
              .map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </MenuItem>
              ))}
          </TextField>
          <Button variant="contained" onClick={onSave} disabled={busy}>
            Save
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
