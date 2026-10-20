import * as url from 'N/url';

export const getUserDomainUrl = (accountId: string): string => {
  return url.resolveDomain({
    hostType: url.HostType.APPLICATION,
    accountId,
  });
};
