/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as file from 'N/file';
import * as log from 'N/log';
import * as search from 'N/search';

export const getClient = () => {
  try {
    const indexFile = file.load({ id: '../client/index.html' });
    const clientFolderPath = indexFile.path.replace('index.html', '');
    const files = getStaticFiles(indexFile.folder, clientFolderPath);
    const html = indexFile.getContents();

    return files.reduce((pre, cur) => {
      return (pre = replaceGlobally(pre, cur.path, cur.url));
    }, html);
  } catch (e) {
    log.error('getClient error', e);
    throw 'Cannot load Client. Please contact app administrator';
  }
};

const replaceGlobally = (original: any, searchTxt: any, replaceTxt: any) => {
  const regex = new RegExp(searchTxt, 'g');
  return original.replace(regex, replaceTxt);
};

const getStaticFiles = (folderId: number, clientFolderPath: string) => {
  return search
    .create({
      type: 'file',
      filters: [['folder', 'anyof', folderId]],
      columns: ['name', 'url'],
    })
    .run()
    .getRange({ start: 0, end: 1000 })
    .map(m => {
      return {
        id: m.id,
        name: m.getValue('name'),
        url: m.getValue('url'),
        path: '/' + file.load({ id: m.id }).path.replace(clientFolderPath, ''),
      };
    });
};
