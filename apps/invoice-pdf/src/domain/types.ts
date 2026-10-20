export const PAGE_SIZE = 5000;

export const MAX_PDF_BATCH = 50;

/** Invoices per RESTlet request; keeps each request far from the time limit. */
export const PDF_CHUNK_SIZE = 5;

/**
 * Requests in flight at once. RESTlet concurrency is shared account-wide with
 * production integrations, so keep this low.
 */
export const PDF_CONCURRENCY = 3;

export interface InvoiceFilters {
  dateFrom: string;
  dateTo: string;
  customerContains: string;
  statusContains: string;
  tranIdContains: string;
}

export const DEFAULT_FILTERS: InvoiceFilters = {
  dateFrom: '',
  dateTo: '',
  customerContains: '',
  statusContains: '',
  tranIdContains: '',
};

export interface InvoiceRow {
  id: string | number;
  tranid: string;
  trandate: string;
  customer: string;
  status: string;
  amount: number | null;
  currency: string;
  duedate: string;
  memo: string;
}

export interface GeneratePdfsInput {
  invoices: Array<{ id: number; tranId: string }>;
}

export interface PdfResult {
  id: number;
  tranId: string;
  base64: string;
  error?: string;
}

export interface GeneratePdfsResponse {
  pdfs: PdfResult[];
  successCount: number;
  errorCount: number;
}
