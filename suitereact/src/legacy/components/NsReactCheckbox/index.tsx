import Checkbox from '@mui/material/Checkbox';
import React from 'react';

import { NsReactFieldDisplayType } from '../../domain';

export default function ControlledCheckbox(props: {
  onChange: any;
  displayType: NsReactFieldDisplayType;
  value?: boolean;
}) {
  const [value, setValue] = React.useState(props.value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.checked);
    props.onChange(event.target.checked);
  };

  React.useEffect(() => {
    // Set the value prop and call props.onChange so value propogates up to NsReactForm
    setValue(props.value);
  }, []);

  return (
    <Checkbox
      checked={value}
      disabled={
        props.displayType === NsReactFieldDisplayType.DISABLED ? true : false
      }
      onChange={handleChange}
      inputProps={{ 'aria-label': 'controlled' }}
    />
  );
}
