import {
  isNsReactTable,
  NsReactClientActionParams,
  NsReactFormGridElementProps,
  NsReactTableHeaderProps,
  NsReactTableRowProps,
  NsReactXlsxFile,
} from '../domain';
import { getElement, getElementsFromRows } from './nsReactFormActions';

export const getNsReactXslxFileFromTableId = async (
  elements: NsReactFormGridElementProps[],
  tableId: string
): Promise<NsReactXlsxFile | null> => {
  const tableData: NsReactFormGridElementProps | undefined = await getElement(
    tableId,
    elements
  );

  if (tableData && tableData.element && isNsReactTable(tableData.element)) {
    // Get XLSX File from Table Data
    const excelFile: NsReactXlsxFile = new NsReactXlsxFile(tableData.element);
    return excelFile;
  }
  return null;
};

export const getNsReactXslxFileFromTableRows = async (
  headerCells: NsReactTableHeaderProps[],
  rows: NsReactTableRowProps[]
): Promise<NsReactXlsxFile | null> => {
  const excelFile: NsReactXlsxFile = new NsReactXlsxFile(
    null,
    undefined,
    headerCells,
    rows
  );
  return excelFile;
};

export const downloadExcelFileFromTable = async (
  params: NsReactClientActionParams
) => {
  const { rows } = params;
  const inputData: { tableId: string; fileName: string } = params.inputData;

  const excelFile: NsReactXlsxFile | null = await getNsReactXslxFileFromTableId(
    getElementsFromRows(rows),
    inputData.tableId
  );
  if (excelFile) {
    if (inputData.fileName) {
      excelFile.title = inputData.fileName;
    }
    excelFile.setHeaderRowBold(excelFile.sheets[0]);
    excelFile.downloadWorkbookXslxFile();
  }
};
