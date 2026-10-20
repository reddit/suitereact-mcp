import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { SxProps } from '@mui/system';
import * as React from 'react';

import {
  getDisplayVariant,
  NsReactFieldDisplayType,
  NsReactFieldVariantType,
} from '../../domain';

export default function NsReactTextField(props: {
  label: string;
  id: string;
  onChange: any;
  value: string;
  displayType: NsReactFieldDisplayType;
  customStyle?: SxProps;
  inputStyle?: SxProps;
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
  variantType?: NsReactFieldVariantType;
}) {
  const [value, setValue] = React.useState<string>(props.value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    props.onChange(event.target.value.toString());
  };
  return (
    <Box component="form" noValidate autoComplete="off">
      <TextField
        label={props.label}
        value={value}
        onChange={handleChange}
        id={props.id}
        InputProps={{
          readOnly:
            props.displayType === NsReactFieldDisplayType.INLINE ? true : false,
          sx: props.inputStyle,
        }}
        variant={
          props.variantType
            ? props.variantType.toString()
            : (getDisplayVariant(props.displayType) as any)
        }
        fullWidth={props.fullWidth || false}
        multiline={props.multiline}
        rows={props.rows || undefined}
        disabled={
          props.displayType === NsReactFieldDisplayType.DISABLED ? true : false
        }
        sx={props.customStyle}
      />
    </Box>
  );
}
