import * as record from 'N/record';

export interface NetsuiteField {
  id: string;
  value: record.FieldValue;
  ignoreFieldChange?: boolean /** If set to true, the field change and slaving event is ignored. */;
}
