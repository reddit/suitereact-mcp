import * as config from 'N/config';
import * as record from 'N/record';

export const getUserTimezone = (): string => {
  const userSettings: record.Record = config.load({
    type: config.Type.USER_PREFERENCES,
  });
  const tzVal: record.FieldValue = userSettings.getValue({
    fieldId: 'TIMEZONE',
  });
  return tzVal ? tzVal.toString() : '';
};
