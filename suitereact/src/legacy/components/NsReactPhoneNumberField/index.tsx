import {
  matchIsValidTel,
  MuiTelInput,
  MuiTelInputContinent,
  MuiTelInputCountry,
  MuiTelInputInfo,
} from 'mui-tel-input';
import React from 'react';

import { getDisplayVariant, NsReactFieldDisplayType } from '../../domain';

export default function NsReactPhoneNumberField(props: {
  id: string;
  label: string;
  onChange: any;
  value: string;
  displayType: NsReactFieldDisplayType;
}) {
  const [value, setValue] = React.useState<string>(props.value);
  const [isError, setIsError] = React.useState<boolean>(false);
  const [helperText, setHelperText] = React.useState<string>('');

  const handleChange = (newValue: string, info: MuiTelInputInfo) => {
    setValue(newValue);
    if (
      matchIsValidTel(newValue) === false &&
      info.nationalNumber &&
      info.nationalNumber.length > 0
    ) {
      setIsError(true);
      setHelperText('Enter a valid phone #');
    } else {
      props.onChange(info.nationalNumber);
      setIsError(false);
      setHelperText('');
    }
  };

  const continents: MuiTelInputContinent[] = ['NA'];
  const onlyCountries: MuiTelInputCountry[] = ['US'];

  return (
    <MuiTelInput
      value={value}
      onChange={handleChange}
      continents={continents}
      onlyCountries={onlyCountries}
      forceCallingCode={true}
      label={props.label}
      id={props.id}
      error={isError}
      helperText={helperText}
      defaultCountry={'US'}
      slotProps={{
        input: {
          readOnly:
            props.displayType === NsReactFieldDisplayType.INLINE ? true : false,
        },
      }}
      variant={getDisplayVariant(props.displayType) as any}
      disabled={
        props.displayType === NsReactFieldDisplayType.DISABLED ? true : false
      }
    />
  );
}
