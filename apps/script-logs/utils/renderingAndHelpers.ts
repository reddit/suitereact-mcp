/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as file from 'N/file';

export const getClient = (): string => {
  const html = file.load({ id: '../client/index.html' }).getContents();
  // File Cabinet media URLs must replace Vite asset paths, including subfolders.
  return html.replace(
    /\b(src|href)="(\/[^"<>]+)"/g,
    (_match, attribute: string, asset: string) => {
      if (asset.includes('..') || asset.startsWith('//'))
        throw new Error('Invalid app asset path');
      const url = file.load({ id: `../client${asset}` }).url;
      return `${attribute}="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    }
  );
};
