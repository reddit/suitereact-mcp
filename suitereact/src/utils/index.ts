import axios from 'axios';
import qs from 'qs';

import { NSRequest } from '../domain';

export type { InferredColType } from './dataGridColumnTypes';
export {
  applyColumnTypes,
  buildColumnTypeMap,
  convertRowValues,
  inferColumnType,
  parseDateValue,
} from './dataGridColumnTypes';

export const ACTION_RESTLET_URL =
  '/app/site/hosting/restlet.nl?script=customscript_sr_rl_rct_action_handler&deploy=customdeploy_sr_rl_rct_action_handler';

export const REST = {
  get: ({ action, data }: NSRequest) =>
    resolveReqAll(
      axios.get(
        `${ACTION_RESTLET_URL}&action=${action}${data ? '&' + qs.stringify(data) : ''}`
      )
    ),
  post: ({ action, data = {} }: NSRequest) =>
    resolveReqAll(axios.post(ACTION_RESTLET_URL, { ...data, action })),
};

export const resolveReqAll = async (deferred: Promise<any>) => {
  try {
    const res = await deferred;
    const data = tryParse(res.data);
    if (data.success) return { data: data.data, error: null };

    return { data: null, error: data };
  } catch (e) {
    return { data: null, error: e };
  }
};

export function tryParse(data: any) {
  try {
    const parsedData = JSON.parse(data);
    return parsedData;
  } catch (e) {
    console.error('Error parsing data', e);
    return data;
  }
}

export function censor(censor: any) {
  let i = 0;

  return function (key: any, value: any) {
    if (
      i !== 0 &&
      typeof censor === 'object' &&
      typeof value == 'object' &&
      censor == value
    )
      return '[Circular]';

    if (i >= 29)
      // seems to be a harded maximum of 30 serialized objects?
      return '[Unknown]';

    ++i; // so we know we aren't using the original object anymore

    return value;
  };
}

export function firstElement<Type>(arr: Type[]): Type | undefined {
  return arr[0];
}

export const getComponentKeyValue = (): number => {
  return window.setTimeout(() => {
    return Date.now();
  }, 1);
};

// Checks if value is null, undefined, or an empty string
export const isEmptyValue = (val: any): boolean => {
  if (val === null || val === undefined || val === '') {
    return true;
  }
  return false;
};
