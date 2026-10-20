import { Box } from '@mui/material';
import { RefObject } from 'react';

import { tokens } from '../../App/theme';

export const SPLIT_MIN = 28;
export const SPLIT_MAX = 60;

const clampSplit = (value: number) =>
  Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value));

/** Vertical separator between the result worklist (left) and the inspector (right). */
export default function SplitDivider({
  container,
  value,
  onChange,
}: {
  container: RefObject<HTMLDivElement>;
  value: number;
  onChange: (value: number) => void;
}) {
  const resize = (x: number) => {
    const bounds = container.current?.getBoundingClientRect();
    if (bounds) onChange(clampSplit(((x - bounds.left) / bounds.width) * 100));
  };
  return (
    <Box
      role="separator"
      tabIndex={0}
      aria-label="Resize log list and details"
      aria-orientation="vertical"
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={Math.round(value)}
      aria-controls="log-table-pane detail-content"
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        resize(event.clientX);
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          resize(event.clientX);
      }}
      onPointerUp={event =>
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onKeyDown={event => {
        const change = { ArrowLeft: -3, ArrowRight: 3 }[event.key];
        if (
          change !== undefined ||
          event.key === 'Home' ||
          event.key === 'End'
        ) {
          event.preventDefault();
          onChange(
            event.key === 'Home'
              ? SPLIT_MIN
              : event.key === 'End'
                ? SPLIT_MAX
                : clampSplit(value + (change || 0))
          );
        }
      }}
      sx={{
        width: 10,
        flexShrink: 0,
        cursor: 'col-resize',
        touchAction: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 1,
        '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
        },
        '&::after': {
          content: '""',
          width: 3,
          height: 40,
          borderRadius: 2,
          bgcolor: tokens.borderStrong,
          transition: 'background-color 120ms',
        },
      }}
    />
  );
}
