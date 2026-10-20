import { NsReactSelectOption } from './suitereact';

export interface NetsuiteQueryResult {
  [fieldId: string]:
    | string
    | string[]
    | number
    | boolean
    | bigint
    | NsReactSelectOption
    | null;
}
