import * as log from 'N/log';
import * as render from 'N/render';

export const generateInvoicePdfs = (props: {
  invoices: Array<{ id: number; tranId: string }>;
}): {
  pdfs: Array<{
    id: number;
    tranId: string;
    base64: string;
    error?: string;
  }>;
  successCount: number;
  errorCount: number;
} => {
  log.debug(
    'generateInvoicePdfs',
    `Generating PDFs for ${props.invoices.length} invoices`
  );

  const pdfs: Array<{
    id: number;
    tranId: string;
    base64: string;
    error?: string;
  }> = [];

  let successCount = 0;
  let errorCount = 0;

  for (const inv of props.invoices) {
    try {
      const pdfFile = render.transaction({
        entityId: inv.id,
        printMode: render.PrintMode.PDF,
      });

      const base64Content = pdfFile.getContents();

      pdfs.push({
        id: inv.id,
        tranId: inv.tranId,
        base64: base64Content,
      });
      successCount++;

      log.debug('generateInvoicePdfs', `PDF generated for ${inv.tranId}`);
    } catch (e) {
      const errMsg =
        e instanceof Error
          ? e.message
          : `Failed to render invoice ${inv.tranId}`;
      log.error('generateInvoicePdfs', `Error for ${inv.tranId}: ${errMsg}`);

      pdfs.push({
        id: inv.id,
        tranId: inv.tranId,
        base64: '',
        error: errMsg,
      });
      errorCount++;
    }
  }

  log.debug(
    'generateInvoicePdfs',
    `Complete: ${successCount} success, ${errorCount} errors`
  );

  return { pdfs, successCount, errorCount };
};
