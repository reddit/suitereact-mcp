import * as file from 'N/file';
import * as log from 'N/log';

export const saveExcelFile = (props: {
  fileName: string;
  excelData: string;
  folderId: number;
  description?: string;
}): number => {
  log.debug('Entered saveExcelFile', props);

  const fileObj = file.create({
    name: props.fileName + '.xlsx',
    fileType: file.Type.EXCEL,
    contents: props.excelData,
    description: props.description ? props.description : '',
    folder: props.folderId,
  });

  const fileId = fileObj.save();
  return fileId;
};
