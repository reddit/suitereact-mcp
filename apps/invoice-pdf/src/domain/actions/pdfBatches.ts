export interface PdfRequest {
  id: number;
  tranId: string;
}

export interface PdfResult extends PdfRequest {
  base64: string;
  error?: string;
}

export interface BatchOptions {
  generate: (invoices: PdfRequest[]) => Promise<{ pdfs: PdfResult[] }>;
  chunkSize: number;
  concurrency: number;
  /** Attempts per request when NetSuite rejects it for concurrency. */
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (finished: number, total: number) => void;
}

export const BUSY_MESSAGE =
  'NetSuite was busy (concurrency limit reached). Retry this invoice.';

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * NetSuite rejects requests above the account's concurrency limit with HTTP
 * 429 / SSS_REQUEST_LIMIT_EXCEEDED. Those are safe to retry; other failures
 * are not.
 */
export function isConcurrencyLimitError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 429) return true;
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  const text = [
    err instanceof Error ? err.message : String(err ?? ''),
    typeof data === 'string' ? data : JSON.stringify(data ?? ''),
  ].join(' ');
  return /SSS_REQUEST_LIMIT_EXCEEDED|status code 429|too many requests/i.test(
    text
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : 'PDF generation failed';
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Renders PDFs as several small requests, a few at a time, so no single
 * request approaches NetSuite's time limit. Results keep the input order, and
 * a request that fails marks only its own invoices as failed.
 */
export async function generatePdfsInBatches(
  invoices: PdfRequest[],
  {
    generate,
    chunkSize,
    concurrency,
    maxAttempts = 4,
    baseDelayMs = 1000,
    sleep = defaultSleep,
    onProgress,
  }: BatchOptions
): Promise<PdfResult[]> {
  const batches = chunk(invoices, Math.max(1, chunkSize));
  const results: PdfResult[][] = new Array(batches.length);
  let next = 0;
  let finished = 0;
  onProgress?.(0, invoices.length);

  const run = async (batch: PdfRequest[]): Promise<PdfResult[]> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const { pdfs } = await generate(batch);
        const byId = new Map(pdfs.map(pdf => [String(pdf.id), pdf]));
        return batch.map(
          inv =>
            byId.get(String(inv.id)) ?? {
              ...inv,
              base64: '',
              error: 'No PDF returned',
            }
        );
      } catch (err) {
        if (isConcurrencyLimitError(err) && attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        const error = isConcurrencyLimitError(err)
          ? BUSY_MESSAGE
          : errorMessage(err);
        return batch.map(inv => ({ ...inv, base64: '', error }));
      }
    }
  };

  const worker = async () => {
    while (next < batches.length) {
      const index = next++;
      results[index] = await run(batches[index]);
      finished += batches[index].length;
      onProgress?.(finished, invoices.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, worker)
  );
  return results.flat();
}
