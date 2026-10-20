import ExcelJS from 'exceljs';

import {
  handleRestletAction,
  NsReactTableHeaderProps,
  NsReactTableProps,
  NsReactTableRowProps,
} from './nsReact';

export class NsReactXlsxFile {
  title: string;
  workbook: ExcelJS.Workbook;
  sheets: ExcelJS.Worksheet[];
  base64DataStr?: string;
  nsFileId?: number;
  apiBaseUrl?: string;
  apiToken?: string;

  constructor(
    table: NsReactTableProps | null,
    title?: string,
    headerCells?: NsReactTableHeaderProps[],
    rows?: NsReactTableRowProps[]
  ) {
    // Create workbook
    this.workbook = new ExcelJS.Workbook();
    this.sheets = [];

    // If table param is passed, use table data to populate sheet
    if (table) {
      this.title = table.title ? table.title : table.tableId;
      this.sheets.push(this.workbook.addWorksheet(this.title));
      this.sheets[0].columns = this.getWorksheetColumnsFromHeaderCells(
        this.sheets[0],
        table.headerCells ? table.headerCells : []
      );
      this.sheets[0] = this.addRowsToWorksheet(
        this.sheets[0],
        table.value ? table.value : []
      );
    } else {
      // Else use the other params
      this.title = title ? title : 'NS React Export';
      this.sheets.push(this.workbook.addWorksheet(this.title));
      this.sheets[0].columns = this.getWorksheetColumnsFromHeaderCells(
        this.sheets[0],
        headerCells ? headerCells : []
      );
      this.sheets[0] = this.addRowsToWorksheet(
        this.sheets[0],
        rows ? rows : []
      );
    }
  }

  addRowsToWorksheet = (
    sheet: ExcelJS.Worksheet,
    rows: NsReactTableRowProps[]
  ): ExcelJS.Worksheet => {
    rows.forEach(r => {
      if (r.visible === undefined || r.visible === true) {
        const row: NsReactTableRowProps = {
          id: 0,
          type: '',
        };
        sheet.columns.forEach(c => {
          if (c.key) {
            const keyValue: any = r[c.key];
            if (keyValue) {
              row[c.key] = keyValue.label ? keyValue.label : keyValue;
            } else {
              row[c.key] = null;
            }
          }
        });
        sheet.addRow(row);
      }
    });

    return sheet;
  };

  downloadWorkbookXslxFile = async () => {
    this.workbook.xlsx
      .writeBuffer()
      .then(async excelData => {
        const blob: Blob = new Blob([excelData], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = url;
        anchor.download = this.title + '.xlsx';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      })
      .catch(err => console.error(err));
  };

  fileToBase64 = () => {
    return new Promise(resolve => {
      this.workbook.xlsx.writeBuffer().then(excelData => {
        const blob: Blob = new Blob([excelData], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const reader = new FileReader();
        reader.onloadend = function (e) {
          if (e.target && e.target.result) {
            const dataStr: string = e.target.result.toString();
            resolve(dataStr.slice(dataStr.indexOf(',') + 1));
          }
        };
        reader.readAsDataURL(blob);
      });
    });
  };

  getWorksheetColumnsFromHeaderCells = (
    sheet: ExcelJS.Worksheet,
    headerCells: NsReactTableHeaderProps[]
  ): Partial<ExcelJS.Column>[] => {
    const columns: Partial<ExcelJS.Column>[] = [];

    for (const h of headerCells) {
      if (h.visible === true && (!h.xlsxWidth || h.xlsxWidth > 0)) {
        columns.push({
          header: h.label,
          key: h.id,
          width: h.xlsxWidth,
        });
      }
    }
    return columns;
  };

  saveToNsFileCabinet = async (
    folderId: number,
    description?: string
  ): Promise<number> => {
    const base64DataStr: any = await this.fileToBase64();
    const fileId: number = (await handleRestletAction(
      'saveExcelFile',
      {
        fileName: this.title,
        excelData: base64DataStr,
        folderId,
        description,
      },
      this.apiBaseUrl ? this.apiBaseUrl : undefined,
      this.apiToken
    )) as number;
    if (fileId) {
      this.nsFileId = fileId;
      return this.nsFileId;
    }
    return -1;
  };

  setHeaderRowBold = (sheet: ExcelJS.Worksheet) => {
    const headerRow = sheet.getRow(1);
    headerRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = { bold: true };
    });
  };
}
