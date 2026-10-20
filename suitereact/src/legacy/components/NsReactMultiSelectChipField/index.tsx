import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { Theme, useTheme } from '@mui/material/styles';
import * as React from 'react';

import { NsReactSelectOption } from '../../domain';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

function getStyles(
  value: string,
  selectedOptions: readonly string[],
  theme: Theme
) {
  return {
    fontWeight:
      selectedOptions.indexOf(value) === -1
        ? theme.typography.fontWeightRegular
        : theme.typography.fontWeightMedium,
  };
}

export default function NsReactMultiSelectChipField(props: {
  id: string;
  label: string;
  options: NsReactSelectOption[];
  onChange: any;
  value?: string;
}) {
  const theme = useTheme();
  const [selectedOptions, setSelectedOptions] = React.useState<string[]>([]);

  const getOptionLabelFromValue = (value: string): string => {
    const optionIndex: number = props.options.findIndex(e => e.value === value);
    if (optionIndex > -1) {
      return props.options[optionIndex].label;
    }
    return '';
  };

  const handleChange = (event: SelectChangeEvent<typeof selectedOptions>) => {
    const {
      target: { value },
    } = event;
    setSelectedOptions(
      // On autofill we get a stringified value.
      typeof value === 'string' ? value.split(',') : value
    );
  };

  return (
    <div>
      <FormControl sx={{ width: '100%' }}>
        <InputLabel id="multiselect-label">{props.label}</InputLabel>
        <Select
          labelId="multiselect-label"
          id={props.id}
          multiple
          value={selectedOptions}
          onChange={handleChange}
          input={
            <OutlinedInput id="select-multiple-chip" label={props.label} />
          }
          renderValue={selected => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map(value => (
                <Chip key={value} label={getOptionLabelFromValue(value)} />
              ))}
            </Box>
          )}
          MenuProps={MenuProps}
        >
          {props.options.map((option, index) => (
            <MenuItem
              key={index}
              value={option.value}
              style={getStyles(option.value, selectedOptions, theme)}
            >
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  );
}
