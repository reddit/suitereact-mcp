import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import axios from 'axios';
import * as React from 'react';

import {
  NsReactFieldDisplayType,
  NsReactFieldType,
  NsReactFieldVariantType,
  NsReactHandleChangeInputProps,
  NsReactMultiSelectType,
  NsReactSelectOption,
} from '../../domain';
import { REST } from '../../utils';
import NsReactCheckbox from '../NsReactCheckbox';
import NsReactCurrencyField from '../NsReactCurrencyField';
import NsReactDateField from '../NsReactDateField';
import NsReactDateTimeField from '../NsReactDateTimeField';
import NsReactEmailField from '../NsReactEmailField';
import NsReactFileField from '../NsReactFileField';
import NsReactFloatField from '../NsReactFloatField';
import NsReactHal from '../NsReactHal';
import NsReactHelpField from '../NsReactHelpField';
import NsReactHtmlField from '../NsReactHtmlField';
import NsReactIntegerField from '../NsReactIntegerField';
import NsReactMultiSelectChipField from '../NsReactMultiSelectChipField';
import NsReactMultiSelectField from '../NsReactMultiSelectField';
import NsReactPhoneNumberField from '../NsReactPhoneNumberField';
import NsReactSelectField from '../NsReactSelectField';
import NsReactTextField from '../NsReactTextField';
import NsReactTimeField from '../NsReactTimeField';

export default function NsReactField(props: {
  id: string;
  label: string;
  fieldType: NsReactFieldType;
  onChange: (props: NsReactHandleChangeInputProps) => void;
  source?: NsReactSelectOption[];
  sourceStr?: string;
  value?: string | number | boolean | NsReactSelectOption;
  displayType?: NsReactFieldDisplayType;
  multiSelectType?: NsReactMultiSelectType;
  required?: boolean;
  customStyle?: React.CSSProperties;
  fullWidth?: boolean;
  inputStyle?: React.CSSProperties;
  multiline?: boolean;
  rows?: number;
  variantType?: NsReactFieldVariantType;
  apiBaseUrl?: string;
  apiToken?: string;
}) {
  const [source, setSource] = React.useState<NsReactSelectOption[]>([]);

  const getMultiSelectField = () => {
    if (props.multiSelectType === NsReactMultiSelectType.CHIP) {
      return (
        <NsReactMultiSelectChipField
          id={props.id}
          label={props.label}
          options={source ? source : []}
          onChange={handleValueChange}
          value={props.value ? JSON.stringify(props.value) : ''}
        />
      );
    }
    return (
      <NsReactMultiSelectField
        id={props.id}
        label={props.label}
        options={source ? source : []}
        onChange={handleValueChange}
        value={props.value ? JSON.stringify(props.value) : ''}
      />
    );
  };

  const getSelectOptionsFromString = async (
    sourceStr: string
  ): Promise<NsReactSelectOption[]> => {
    let data: any;

    try {
      if (props.apiBaseUrl && props.apiBaseUrl.length) {
        const apiClient = axios.create({
          baseURL: props.apiBaseUrl,
          headers: props.apiToken
            ? { 'X-SuiteReact-Proxy-Token': props.apiToken }
            : undefined,
        });
        const response = await apiClient.post('/api/handle-action', {
          params: {
            actionProps: {
              action: 'getSelectOptionsFromString',
              elementValues: [],
            },
          },
          inputData: {
            sourceStr,
          },
        });

        if (response.data.error) {
          console.error('Error fetching select options:', response.data.error);
          return [];
        }

        data = response.data;
      } else {
        const result = await REST.get({
          action: 'getSelectOptionsFromString',
          data: {
            sourceStr,
          },
        });

        if (result.error) {
          console.error('Error fetching select options:', result.error);
          return [];
        }

        data = result.data;
      }

      setSource(data);
      props.onChange({ elementId: props.id, key: 'source', newValue: data });
      return data;
    } catch (error: any) {
      console.error('Error in getSelectOptionsFromString', {
        status: error?.response?.status,
      });
      return [];
    }
  };

  const handleValueChange = (
    newValue: string | number | boolean | NsReactSelectOption
  ) => {
    props.onChange({ elementId: props.id, key: 'value', newValue });
  };

  React.useEffect(() => {
    // If source is provided directly via props, use it
    if (props.source && props.source.length > 0) {
      setSource(props.source);
      return;
    }

    // declare the data fetching function
    const getSelectOptions = async (
      sourceStr: string
    ): Promise<NsReactSelectOption[]> => {
      console.warn('sourceStr', sourceStr);
      if (sourceStr && sourceStr.length > 0) {
        return await getSelectOptionsFromString(sourceStr);
      } else {
        setSource([]);
        return [];
      }
    };

    // call the function
    if (props.sourceStr) {
      getSelectOptions(props.sourceStr || '')
        // make sure to catch any error
        .catch(console.error);
    }
  }, [props.source, props.sourceStr]);

  return (
    <>
      {props.fieldType === NsReactFieldType.CHECKBOX && ( // Checkbox Field Type
        <FormGroup>
          <FormControlLabel
            control={
              <NsReactCheckbox
                value={
                  props.value
                    ? props.value.toString().toLowerCase() === 'true'
                    : false
                }
                onChange={handleValueChange}
                displayType={
                  props.displayType
                    ? props.displayType
                    : NsReactFieldDisplayType.NORMAL
                }
              />
            }
            label={props.label}
          />
        </FormGroup>
      )}
      {props.fieldType === NsReactFieldType.CURRENCY && ( // Currency field type
        <NsReactCurrencyField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.DATE && ( // Date field type
        <NsReactDateField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : null}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.DATE_TIME && ( // Date-Time field type
        <NsReactDateTimeField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : null}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.EMAIL && ( // Email field type
        <NsReactEmailField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.FILE && ( // File field type - Currently only support .csv files
        <NsReactFileField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
        />
      )}
      {props.fieldType === NsReactFieldType.FLOAT && ( // Float field type
        <NsReactFloatField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.HELP_TEXT && ( // Help field Type
        <NsReactHelpField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          customStyle={props.customStyle}
        />
      )}
      {props.fieldType === NsReactFieldType.HAL && ( // Help field Type
        <NsReactHal />
      )}
      {props.fieldType === NsReactFieldType.HTML && ( // HTML field Type
        <NsReactHtmlField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          customStyle={props.customStyle}
        />
      )}
      {props.fieldType === NsReactFieldType.INTEGER && ( // Integer field type
        <NsReactIntegerField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.MULTISELECT && // Multi-Select field Type
        getMultiSelectField()}
      {props.fieldType === NsReactFieldType.PHONE && ( // Phone Number field type
        <NsReactPhoneNumberField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
      {props.fieldType === NsReactFieldType.SELECT && ( // Select field Type
        <NsReactSelectField
          id={props.id}
          label={props.label}
          options={source ? source : []}
          onChange={handleValueChange}
          value={props.value ? JSON.stringify(props.value) : ''}
        />
      )}
      {props.fieldType === NsReactFieldType.TEXT && ( // Text field type
        <NsReactTextField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
          customStyle={props.customStyle}
          fullWidth={props.fullWidth}
          inputStyle={props.inputStyle}
          multiline={props.multiline}
          rows={props.rows}
          variantType={props.variantType}
        />
      )}
      {props.fieldType === NsReactFieldType.TIME_OF_DAY && ( // Time field type
        <NsReactTimeField
          id={props.id}
          label={props.label}
          onChange={handleValueChange}
          value={props.value ? props.value.toString() : ''}
          displayType={
            props.displayType
              ? props.displayType
              : NsReactFieldDisplayType.NORMAL
          }
        />
      )}
    </>
  );
}
