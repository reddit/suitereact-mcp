import * as runtime from 'N/runtime';

import { NsReactUserProps } from '../domain/suitereact';

import { getUserDomainUrl } from './getUserDomainUrl';
import { getUserTimezone } from './getUserTimezone';

export const getUserProps = (): NsReactUserProps => {
  const userProps: NsReactUserProps = {};
  if (runtime.accountId) {
    userProps.accountId = runtime.accountId;
  }
  const timezone: string = getUserTimezone();
  if (timezone) {
    userProps.timezone = timezone;
  }
  const domainUrl: string = getUserDomainUrl(runtime.accountId);
  if (domainUrl) {
    userProps.domainUrl = domainUrl;
  }
  return userProps;
};
