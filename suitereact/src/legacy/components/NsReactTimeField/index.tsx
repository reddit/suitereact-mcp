import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import * as React from 'react';

import { getDisplayVariant, NsReactFieldDisplayType } from '../../domain';

export default function NsReactTimeField(props: {
  id: string;
  label: string;
  onChange: any;
  value: string;
  displayType: NsReactFieldDisplayType;
}) {
  dayjs.extend(customParseFormat);
  const [value, setValue] = React.useState<dayjs.Dayjs | null>(
    props.value ? dayjs(props.value, 'h:m A') : null
  );

  const handleChange = (newValue: dayjs.Dayjs | null) => {
    setValue(newValue);
    props.onChange(newValue ? newValue.format('HH:mm:00:00Z') : null);
  };
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <TimePicker
        label={props.label}
        value={value}
        onChange={handleChange}
        slotProps={{
          textField: { variant: getDisplayVariant(props.displayType) },
        }}
        disabled={
          props.displayType === NsReactFieldDisplayType.DISABLED ? true : false
        }
        readOnly={
          props.displayType === NsReactFieldDisplayType.INLINE ? true : false
        }
      />
    </LocalizationProvider>
  );
}
