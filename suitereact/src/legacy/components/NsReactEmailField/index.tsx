import TextField from '@mui/material/TextField';
import React from 'react';
import validator from 'validator';

import { getDisplayVariant, NsReactFieldDisplayType } from '../../domain';

export default function NsReactEmailField(props: {
  id: string;
  label: string;
  onChange: any;
  value: string;
  displayType: NsReactFieldDisplayType;
}) {
  const [value, setValue] = React.useState<string>(props.value);
  const [isError, setIsError] = React.useState<boolean>(false);
  const [helperText, setHelperText] = React.useState<string>('');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const email: string = event.target.value;
    setValue(email);
    if (!validator.isEmail(email) && email.length > 0) {
      setIsError(true);
      setHelperText('Enter a valid email address');
    } else {
      props.onChange(email);
      setIsError(false);
      setHelperText('');
    }
  };

  return (
    <TextField
      value={value}
      onChange={handleChange}
      id={props.id}
      label={props.label}
      type="email"
      error={isError}
      helperText={helperText}
      InputProps={{
        readOnly:
          props.displayType === NsReactFieldDisplayType.INLINE ? true : false,
      }}
      variant={getDisplayVariant(props.displayType) as any}
      disabled={
        props.displayType === NsReactFieldDisplayType.DISABLED ? true : false
      }
    />
  );
}
