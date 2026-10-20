import * as record from 'N/record';

import { NetsuiteRecord } from './netsuiteRecord';

export class NetsuiteEmail extends NetsuiteRecord {
  sentDate?: string;
  primaryRecipients?: string;
  ccRecipients?: string;
  subject?: string;
  body?: string;
  attachmentName?: string;
  attachmentUrl?: string;

  constructor(id?: number, rec?: record.Record) {
    super(rec, id, record.Type.MESSAGE);
  }
}
