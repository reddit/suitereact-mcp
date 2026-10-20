import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import * as React from 'react';

import { getDisplayVariant, NsReactFieldDisplayType } from '../../domain';

export default function NsReactDateTimeField(props: {
  id: string;
  label: string;
  onChange: any;
  value: string | null;
  displayType: NsReactFieldDisplayType;
}) {
  dayjs.extend(customParseFormat);
  const [value, setValue] = React.useState<dayjs.Dayjs | null>(
    props.value ? dayjs(props.value, 'MM/DD/YYYY hh:mm A') : null
  );

  const handleChange = (newValue: dayjs.Dayjs | null) => {
    setValue(newValue);
    props.onChange(newValue ? newValue.toJSON() : null);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateTimePicker
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
