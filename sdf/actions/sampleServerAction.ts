// path `sdf/actions/appNameActions.ts
// also have to update the `sdf/actions/index.ts` file to export the action(s)

// Example to show where to pull in Netsuite module imports
import * as log from 'N/log';

// Example to show where to pull in suitereact module imports
import { NsReactSelectOption } from '../domain/suitereact';

export const exampleServerAction = ({
  firstParam,
}: {
  firstParam: string;
}): string => {
  log.debug('Entered exampleServerAction', firstParam);

  // Example to show where to pull in suitereact module imports
  const selectOptions: NsReactSelectOption[] = [];
  log.debug('selectOptions', selectOptions);

  return 'Hello World';
};
