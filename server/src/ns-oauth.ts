import crypto from 'crypto';
import dotenv from 'dotenv';
import qs from 'qs';
import * as R from 'ramda';

dotenv.config();
const {
  REACT_APP_NS_ACCOUNT_ID,
  REACT_APP_NS_TOKEN_ID,
  REACT_APP_NS_TOKEN_SECRET,
  REACT_APP_NS_CONSUMER_KEY,
  REACT_APP_NS_CONSUMER_SECRET,
} = process.env;

const restletURL = `https://${(REACT_APP_NS_ACCOUNT_ID || '')
  .replace('_', '-')
  .toLowerCase()}.restlets.api.netsuite.com/app/site/hosting/restlet.nl`;

function getNonce(length: number) {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function buildOAuthHeader(
  method: string,
  baseUrl: string,
  queryParams: Record<string, string | number> = {}
): string {
  const OAUTH_VERSION = '1.0';
  const OAUTH_NONCE = getNonce(32);
  const TIME_STAMP = Math.round(+new Date() / 1000);

  const unsortedData: Record<string, string | number> = {
    oauth_consumer_key: REACT_APP_NS_CONSUMER_KEY || '',
    oauth_nonce: OAUTH_NONCE,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: TIME_STAMP,
    oauth_token: REACT_APP_NS_TOKEN_ID || '',
    oauth_version: OAUTH_VERSION,
    ...queryParams,
  };

  const sortedPairs = R.pipe(
    R.toPairs,
    R.sortBy<[string, string | number]>(R.prop(0))
  )(unsortedData);

  const data = qs.stringify(R.fromPairs(sortedPairs));

  const completeData =
    method.toUpperCase() +
    '&' +
    encodeURIComponent(baseUrl) +
    '&' +
    encodeURIComponent(data);

  const key = REACT_APP_NS_CONSUMER_SECRET + '&' + REACT_APP_NS_TOKEN_SECRET;
  const sha256 = crypto
    .createHmac('sha256', key)
    .update(completeData)
    .digest('base64');

  const oauth_signature = encodeURIComponent(sha256);

  return (
    `OAuth realm="${(REACT_APP_NS_ACCOUNT_ID || '')
      .replace('-', '_')
      .toUpperCase()}",` +
    `oauth_token="${REACT_APP_NS_TOKEN_ID}",` +
    `oauth_consumer_key="${REACT_APP_NS_CONSUMER_KEY}",` +
    `oauth_nonce="${OAUTH_NONCE}",` +
    `oauth_timestamp="${TIME_STAMP}",` +
    `oauth_signature_method="HMAC-SHA256",` +
    `oauth_version="${OAUTH_VERSION}",` +
    `oauth_signature="${oauth_signature}"`
  );
}

/**
 * Sign an arbitrary URL with OAuth 1.0 TBA for any NetSuite REST endpoint.
 */
export function signUrl(method: string, fullUrl: string): string {
  const [baseUrl, queryString] = fullUrl.split('?');
  const queryParams = queryString
    ? (qs.parse(queryString) as Record<string, string | number>)
    : {};
  return buildOAuthHeader(method, baseUrl, queryParams);
}

/**
 * Sign an axios request (used by the interceptor for restlet calls).
 */
const oauth = (req: any) => {
  const query = qs.parse(req.url.split('?')[1]) as Record<
    string,
    string | number
  >;
  return buildOAuthHeader(req.method.toUpperCase(), restletURL, query);
};

export default oauth;
