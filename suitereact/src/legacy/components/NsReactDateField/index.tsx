import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import * as React from 'react';

import { getDisplayVariant, NsReactFieldDisplayType } from '../../domain';

export default function NsReactDateField(props: {
  id: string;
  label: string;
  onChange: any;
  value: string | null;
  displayType: NsReactFieldDisplayType;
}) {
  dayjs.extend(customParseFormat);
  const [value, setValue] = React.useState<dayjs.Dayjs | null>(
    props.value ? dayjs(props.value, 'MM/DD/YYYY') : null
  );

  const handleChange = (newValue: dayjs.Dayjs | null) => {
    setValue(newValue);
    props.onChange(newValue ? newValue.format('MM/DD/YYYY') : null);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DesktopDatePicker
        label={props.label}
        format="MM/DD/YYYY"
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
