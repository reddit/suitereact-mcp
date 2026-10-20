import axios from 'axios';
import * as React from 'react';
import { z } from 'zod';

import { REST } from '../utils';

/**
 * Returns the Material UI display variant enum related to the provided NsReactFieldDisplayType
 * @param displayType - NsReactFieldDisplayType - suitereact field display type for this field
 * @returns - string - Material UI display variant enum
 */
export const getDisplayVariant = (
  displayType: NsReactFieldDisplayType
): 'standard' | 'outlined' | 'filled' => {
  if (displayType === NsReactFieldDisplayType.INLINE) {
    return 'standard';
  } else {
    return 'outlined' as any;
  }
};

export const getElementValue = (
  id: string,
  elements: NsReactElementValue[]
):
  | string
  | number
  | boolean
  | NsReactSelectOption
  | NsReactChatMessage[]
  | Record<string, unknown>
  | Record<string, unknown>[]
  | null
  | undefined => {
  const matchIndex: number = elements.findIndex(e => e.elementId === id);
  if (matchIndex > -1) {
    return elements[matchIndex].value ? elements[matchIndex].value : null;
  }
  return null;
};

export const handleRestletAction = async <T = unknown,>(
  action: string,
  inputData: unknown,
  apiBaseUrl?: string,
  proxyToken?: string
): Promise<T> => {
  if (apiBaseUrl) {
    const apiClient = axios.create({
      baseURL: apiBaseUrl,
      headers: proxyToken
        ? { 'X-SuiteReact-Proxy-Token': proxyToken }
        : undefined,
    });
    const response = await apiClient.post('/api/handle-action', {
      params: {
        actionProps: {
          action,
        },
      },
      inputData,
    });
    return response.data as T;
  }

  const { data, error } = await REST.post({
    action,
    data: inputData,
  });
  if (error) throw toRestletError(error, action);
  return data as T;
};

function toRestletError(error: unknown, action: string): Error {
  if (error instanceof Error) return error;

  if (typeof error === 'object' && error !== null) {
    const payload = error as { error?: unknown; message?: unknown };
    const detail = payload.message ?? payload.error;
    if (typeof detail === 'string' && detail.trim()) return new Error(detail);
  }

  if (typeof error === 'string' && error.trim()) return new Error(error);
  return new Error(`RESTlet action ${action} failed`);
}

// Functions to check element type
export function isNsReactButton(object: any): object is NsReactButtonProps {
  return 'buttonId' in object;
}
export function isNsReactField(object: any): object is NsReactFieldProps {
  return 'fieldId' in object;
}
export function isNsReactTable(object: any): object is NsReactTableProps {
  return 'tableId' in object;
}

export function isNsReactChatbot(object: any): object is NsReactChatbotProps {
  return 'chatbotId' in object;
}

export interface NsReactActionProps {
  action: string; // name of the function to be executed
  paramIds?: string[]; // array of react element ids - data of the elements matching these ids will be passed to the action function. If left blank, all element data will be passed.
  formElements?: Array<NsReactFieldProps | NsReactButtonProps>;
  elementValues?: NsReactElementValue[];
  onResponse?: NsReactActionProps; // Action to be executed on the data received from the initial action function's response
}
export interface NsReactButtonProps {
  buttonId: string;
  label: string;
  onClick: NsReactActionProps;
  value?: string | number | boolean | NsReactSelectOption;
  hidden?: boolean;
  params?: { [x: string]: unknown };
  customStyle?: React.CSSProperties;
}

/**
 * NsReactClientActionParams - Parameters for client-side action functions
 *
 * @param rows - Array of form grid rows
 * @param actionProps - Action properties - only the action name is required
 * @param updateRows - Function to update the form grid rows and re-render the form
 * @param setFormCss - Function to update the form's CSS
 * @param inputData - Optional data to be passed to the action function
 */
export interface NsReactClientActionParams {
  rows: NsReactFormGridElementProps[][];
  actionProps: NsReactActionProps;
  updateRows: (
    rows: NsReactFormGridElementProps[][]
  ) => NsReactFormGridElementProps[][];
  setFormCss: React.Dispatch<React.SetStateAction<React.CSSProperties>>;
  inputData?: any;
}

export enum NsReactDataGridFilterOperator {
  AFTER = 'after',
  ANY_OF = 'isAnyOf',
  BEFORE = 'before',
  CONTAIN = 'contains',
  EMPTY = 'isEmpty',
  EMPTY_NOT = 'isNotEmpty',
  END_WITH = 'endsWith',
  EQUAL = '=', // Used for numbers
  EQUAL_NOT = '!=',
  EQUAL_STRING = 'equals', // Used for strings
  GREATER = '>',
  GREATER_OR_EQUAL = '>=',
  IS = 'is',
  IS_NOT = 'not',
  LESS = '<',
  LESS_OR_EQUAL = '<=',
  ON_OR_AFTER = 'onOrAfter',
  ON_OR_BEFORE = 'onOrBefore',
  START_WITH = 'startsWith',
}

export interface NsReactElementValue {
  elementId: string; // Generic element ID that can be buttonId, fieldId, tableId, or chatbotId
  value?:
    | string
    | number
    | boolean
    | NsReactSelectOption
    | NsReactChatMessage[]
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null;
}

export enum NsReactFieldDisplayType {
  DISABLED = 'disabled',
  INLINE = 'inline',
  NORMAL = 'normal',
}

export interface NsReactFieldProps {
  fieldId: string;
  label: string;
  fieldType: NsReactFieldType;
  source?: NsReactSelectOption[];
  sourceStr?: string;
  value?: string | number | boolean | NsReactSelectOption;
  hidden?: boolean;
  displayType?: NsReactFieldDisplayType;
  multiSelectType?: NsReactMultiSelectType;
  customStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
  variantType?: NsReactFieldVariantType;
}

export enum NsReactFieldType {
  CHECKBOX = 'checkbox',
  CURRENCY = 'currency',
  DATE = 'date',
  DATE_TIME = 'datetime',
  EMAIL = 'email',
  FILE = 'file',
  FLOAT = 'float',
  HAL = 'hal',
  HELP_TEXT = 'help',
  HTML = 'html',
  INTEGER = 'integer',
  // IMAGE = 'image', // todo
  MULTISELECT = 'multiselect',
  // PASSWORD = 'password',
  // PERCENT = 'percent',
  PHONE = 'phone',
  SELECT = 'select',
  TEXT = 'text',
  // TEXTAREA = 'textarea',
  TIME_OF_DAY = 'timeofday',
  // URL = 'url',
}

export enum NsReactFieldVariantType {
  FILLED = 'filled',
  OUTLINED = 'outlined',
  STANDARD = 'standard',
}

export interface NsReactChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface NsReactStructuredOutput {
  name: string;
  schema: z.ZodType<any>;
}

// New types for model selection and client configuration
export type NsReactChatClientType = 'openai' | 'openrouter';

export interface NsReactChatModelDefinition {
  id: string;
  name: string;
  clientType: NsReactChatClientType;
  model: string; // The actual model identifier to send to the API
}

export interface NsReactChatClientConfig {
  systemContext?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  restletUrl?: string; // Optional - defaults to standard LLM proxy RESTlet
}

export interface NsReactChatbotProps {
  chatbotId: string;
  clientConfig?: NsReactChatClientConfig;
  availableModels?: NsReactChatModelDefinition[];
  defaultModelId?: string;
  // Common props
  title?: string;
  placeholder?: string;
  height?: string;
  hidden?: boolean;
  customStyle?: React.CSSProperties;
  value?: NsReactChatMessage[];
  structuredOutput?: NsReactStructuredOutput;
  onResponse?: NsReactActionProps;
  allowHtml?: boolean;
  apiBaseUrl?: string;
  apiToken?: string;
}

export interface NsReactFormGridElementProps {
  element?:
    | NsReactButtonProps
    | NsReactFieldProps
    | NsReactTableProps
    | NsReactChatbotProps;
  width: number;
  rowIndex?: number;
  elementIndex?: number;
  key?: React.Key;
}

export interface NsReactHandleActionInputProps {
  actionProps: NsReactActionProps;
  inputData?: any;
}

export interface NsReactHandleChangeInputProps {
  elementId: string; // Generic element ID that can be buttonId, fieldId, tableId, or chatbotId
  key: string;
  newValue:
    | string
    | number
    | boolean
    | NsReactSelectOption
    | NsReactTableHeaderProps[]
    | NsReactTableRowProps[]
    | NsReactChatMessage[]
    | null;
}

export interface NsReactImageProps {
  src: string;
  height?: string;
  width?: string;
}

export enum NsReactMultiSelectType {
  CHIP,
  CLASSIC,
}

export interface NsReactPropTypeMap {
  id: string;
  type: NsReactTableDataType;
}

export interface NsReactSelectOption {
  value: any;
  label: string;
  isSelected?: boolean;
}

export interface NsReactSetElementKeyInputProps {
  rowIndex: number;
  elementIndex: number;
}

export enum NsReactTableDataType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'dateTime',
  NUMBER = 'number',
  SELECT = 'singleSelect',
  STRING = 'string',
  URL = 'url',
}

export interface NsReactTableDrilldownProps {
  headers: NsReactTableHeaderProps[];
  data: Array<Record<string, unknown>>;
}

/**
 * Saved-search column summary types, matching the runtime values of
 * N/search `search.Summary` (kept local so published types need no
 * NetSuite type package).
 */
export type NsReactSearchSummary =
  'GROUP' | 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

export interface NsReactTableHeaderProps {
  id: string;
  label: string;
  align?: TableCellAlignOptions;
  disablePadding?: boolean;
  join?: string;
  sortable?: boolean;
  summary?: NsReactSearchSummary;
  appWidth?: number;
  visible?: boolean;
  xlsxWidth?: number;
}

export interface NsReactTableProps {
  tableId: string;
  title?: string;
  checkboxSelection?: boolean;
  loading?: boolean; // If set to true, the table is loading at initial render
  headerCells?: NsReactTableHeaderProps[];
  source?: NsReactTableSource;
  value?: NsReactTableRowProps[];
  actionButtons?: NsReactButtonProps[];
  pageSize?: number;
  hidden?: boolean;
  hideToolbar?: boolean;
  exportFileNameTemplate?: string;
}

export interface NsReactTableRowProps {
  id: number;
  type: string;
  [x: string]: unknown;
  selected?: boolean;
  visible?: boolean;
  drilldown?: NsReactTableDrilldownProps;
}

export interface NsReactTableSource {
  id: string; // Can be character-based id (e.g. 'customsearch_so_daily') or numeric NS internal id
  type: NsReactTableSourceType;
}

export enum NsReactTableSourceType {
  QUERY,
  SEARCH,
  SUITEQL,
}

export interface NsReactUrlField {
  displayText: string;
  url: string;
  newWindow?: boolean; // Defaults to true
}

export interface NsReactUserProps {
  accountId?: string;
  domainUrl?: string;
  timezone?: string;
}

export enum TableCellAlignOptions {
  CENTER = 'center',
  INHERIT = 'inherit',
  JUSTIFY = 'justify',
  LEFT = 'left',
  RIGHT = 'right',
}

export type NSRequest = {
  action: string;
  data?: any;
};

/**
 * Returns a wrapped error response
 * @function errorResponse
 * @param {String} e - The system or message error
 * @param {String} msg - Message explaining the error
 * @returns {Object} - JSON.stringify Object
 * {success: (boolean), error, message}
 */
export const errorResponse = (e: string, msg?: string) => {
  return JSON.stringify({
    success: false,
    error: e,
    message: msg,
  });
};

/**
 * Returns an errorResponse stating a pamrameter is missing for a function that was called
 * @function errorResponse
 * @param {String} par - The param that is missing
 * @returns {Object} - errorResponse
 */
export const reqPar = (par: string) => {
  return errorResponse(
    'Missing req. param',
    'Missing required parameter: ' + par
  );
};

/**
 * Returns a successResponse with data
 * @function successResponse
 * @param {Object} response - The data you want to return
 * @returns {Object}
 * {success:(boolean), data:(response)}
 */
export const successResponse = (response: any) => {
  return JSON.stringify({
    success: true,
    data: response,
  });
};
