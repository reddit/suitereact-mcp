import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { FilterOptionsState } from '@mui/material/useAutocomplete';
import { matchSorter } from 'match-sorter';
import React from 'react';

import { NsReactSelectOption } from '../../domain';

export default function ControllableStates(props: {
  id: string;
  label: string;
  options: NsReactSelectOption[];
  onChange: any;
  value?: string;
}) {
  const [value, setValue] = React.useState<NsReactSelectOption | null>(
    props.value ? JSON.parse(props.value) : null
  );
  const filterOptions = (
    options: NsReactSelectOption[],
    state: FilterOptionsState<NsReactSelectOption>
  ) => {
    const matchOptions = matchSorter(options, state.inputValue, {
      keys: ['label'],
      threshold: matchSorter.rankings.CONTAINS,
    });
    return matchOptions;
  };

  return (
    <Autocomplete
      autoHighlight
      filterOptions={filterOptions}
      id={props.id}
      options={props.options}
      value={value}
      renderInput={params => <TextField {...params} label={props.label} />}
      getOptionLabel={option => option.label}
      onChange={(event: any, newValue: NsReactSelectOption | null) => {
        if (newValue) {
          newValue.isSelected = true;
          setValue(newValue);
        } else {
          setValue(null);
        }
        props.onChange(newValue);
      }}
    />
  );
}
