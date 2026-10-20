import TextField from '@mui/material/TextField';
import React from 'react';
import { NumericFormat, NumericFormatProps } from 'react-number-format';

import { getDisplayVariant, NsReactFieldDisplayType } from '../../domain';

interface CustomProps {
  onChange: (event: { target: { name: string; value: string } }) => void;
  name: string;
}

const NumberFormatCustom = React.forwardRef<NumericFormatProps, CustomProps>(
  function NumberFormatCustom(props, ref) {
    const { onChange, ...other } = props;

    return (
      <NumericFormat
        {...other}
        getInputRef={ref}
        onValueChange={(values: any) => {
          onChange({
            target: {
              name: props.name,
              value: values.value,
            },
          });
        }}
        thousandSeparator
        valueIsNumericString
      />
    );
  }
);

interface State {
  numberformat: string;
}

export default function FormattedInputs(props: {
  label: string;
  id: string;
  onChange: any;
  value: string;
  displayType: NsReactFieldDisplayType;
}) {
  const [values, setValues] = React.useState<State>({
    numberformat: props.value,
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues({
      ...values,
      [event.target.name]: event.target.value,
    });
    props.onChange(event.target.value ? parseFloat(event.target.value) : null);
  };

  return (
    <TextField
      label={props.label}
      value={values.numberformat}
      onChange={handleChange}
      name="numberformat"
      id={props.id}
      InputProps={{
        inputComponent: NumberFormatCustom as any,
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
