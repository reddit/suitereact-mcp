import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import * as React from 'react';

import { NsReactSelectOption } from '../../domain';

export default function NsReactMultiSelectField(props: {
  id: string;
  label: string;
  options: NsReactSelectOption[];
  onChange: any;
  value?: string;
}) {
  const [selectedOption, setSelectedOption] = React.useState<string[]>([]);
  const handleChangeMultiple = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { options } = event.target;
    const value: string[] = [];
    for (let i = 0, l = options.length; i < l; i += 1) {
      if (options[i].selected) {
        value.push(options[i].value);
      }
    }
    setSelectedOption(value);
  };

  return (
    <div>
      <FormControl sx={{ width: '100%' }}>
        <InputLabel shrink htmlFor="select-multiple-native">
          {props.label}
        </InputLabel>
        {props.options.length === 0 && (
          <Box sx={{ border: 1, display: 'flex', marginTop: '10px' }}>
            <CircularProgress sx={{ padding: 1 }} />
          </Box>
        )}
        {props.options.length > 0 && (
          <Select<string[]>
            multiple
            native
            value={selectedOption}
            // @ts-ignore Typings are not considering `native`
            onChange={handleChangeMultiple}
            label={props.label}
            inputProps={{
              id: 'select-multiple-native',
            }}
          >
            {props.options.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormControl>
    </div>
  );
}
