import * as email from 'N/email';
import * as file from 'N/file';
import * as format from 'N/format';
import * as log from 'N/log';
import * as query from 'N/query';
import * as record from 'N/record';
import * as render from 'N/render';
import * as runtime from 'N/runtime';
import * as search from 'N/search';

import { NetsuiteEmail } from '../domain/netsuiteEmail';
import { NetsuiteQueryResult } from '../domain/netsuiteQueryResult';
import { NetsuiteQueryTransactionStatus } from '../domain/netsuiteQueryTransactionStatus';
import { NetsuiteQueryTransactionType } from '../domain/netsuiteQueryTransactionType';
import { NetsuiteRecord } from '../domain/netsuiteRecord';
import {
  getElementValue,
  NsReactElementValue,
  NsReactSelectOption,
  NsReactTableHeaderProps,
  NsReactTableRowProps,
  TableCellAlignOptions,
} from '../domain/suitereact';

export const getStatementData = (props: {
  elements: NsReactElementValue[];
}) => {
  try {
    const formElements: NsReactElementValue[] = props.elements;
    // Get values for filter fields
    const customer: NsReactSelectOption = getElementValue(
      'selectCustomer',
      formElements
    ) as NsReactSelectOption;
    const startDate: string = getElementValue(
      'startDate',
      formElements
    ) as string;
    const terms: NsReactSelectOption = getElementValue(
      'selectTerms',
      formElements
    ) as NsReactSelectOption;
    const openTransactions: boolean = getElementValue(
      'openTransactions',
      formElements
    ) as boolean;

    log.audit('Statement data request', {
      hasCustomer: Boolean(customer?.value),
      hasStartDate: Boolean(startDate),
      hasTerms: Boolean(terms?.value),
      openTransactions,
    });

    // Create query object
    const statementQuery: query.Query = query.create({
      type: 'transaction',
    });

    // Create joins
    const customerJoin = statementQuery.joinTo({
      fieldId: 'entity',
      target: 'customer',
    });

    // Create conditions
    if (openTransactions && openTransactions === true) {
      statementQuery.condition = statementQuery.and(
        customerJoin.createCondition({
          fieldId: 'isinactive',
          operator: query.Operator.IS,
          values: false,
        }),
        statementQuery.or(
          statementQuery.and(
            statementQuery.createCondition({
              fieldId: 'type',
              operator: query.Operator.ANY_OF,
              values: ['CustCred'],
            }),
            statementQuery.createCondition({
              fieldId: 'transactionlines.mainline',
              operator: query.Operator.IS,
              values: true,
            }),
            statementQuery.createCondition({
              fieldId: 'status',
              operator: query.Operator.ANY_OF,
              values: ['CustCred:A'],
            })
          ),
          statementQuery.and(
            statementQuery.createCondition({
              fieldId: 'type',
              operator: query.Operator.ANY_OF,
              values: ['CustPymt'],
            }),
            statementQuery.createCondition({
              fieldId: 'transactionlines.mainline',
              operator: query.Operator.IS,
              values: true,
            }),
            statementQuery.createCondition({
              fieldId: 'foreignpaymentamountunused',
              operator: query.Operator.GREATER,
              values: '0',
            })
          ),
          statementQuery.and(
            statementQuery.createCondition({
              fieldId: 'type',
              operator: query.Operator.ANY_OF,
              values: ['CustInvc'],
            }),
            statementQuery.createCondition({
              fieldId: 'transactionlines.mainline',
              operator: query.Operator.IS,
              values: true,
            }),
            statementQuery.createCondition({
              fieldId: 'status',
              operator: query.Operator.ANY_OF,
              values: ['CustInvc:A'],
            })
          )
        )
      );
    } else {
      statementQuery.condition = statementQuery.and(
        customerJoin.createCondition({
          fieldId: 'isinactive',
          operator: query.Operator.IS,
          values: false,
        }),
        statementQuery.or(
          statementQuery.and(
            statementQuery.createCondition({
              fieldId: 'type',
              operator: query.Operator.ANY_OF,
              values: ['CustCred'],
            }),
            statementQuery.createCondition({
              fieldId: 'transactionlines.mainline',
              operator: query.Operator.IS,
              values: true,
            })
          ),
          statementQuery.and(
            statementQuery.createCondition({
              fieldId: 'type',
              operator: query.Operator.ANY_OF,
              values: ['CustPymt'],
            }),
            statementQuery.createCondition({
              fieldId: 'transactionlines.mainline',
              operator: query.Operator.IS,
              values: true,
            })
          ),
          statementQuery.and(
            statementQuery.createCondition({
              fieldId: 'type',
              operator: query.Operator.ANY_OF,
              values: ['CustInvc'],
            }),
            statementQuery.createCondition({
              fieldId: 'transactionlines.mainline',
              operator: query.Operator.IS,
              values: true,
            })
          )
        )
      );
    }

    // Add conditions based on incoming field params
    if (customer && customer.value) {
      statementQuery.condition = statementQuery.and(
        statementQuery.condition,
        statementQuery.createCondition({
          fieldId: 'entity',
          operator: query.Operator.ANY_OF,
          values: [customer.value],
        })
      );
    }

    if (startDate) {
      statementQuery.condition = statementQuery.and(
        statementQuery.condition,
        statementQuery.createCondition({
          fieldId: 'trandate',
          operator: query.Operator.ON_OR_AFTER,
          values: [new Date(startDate)],
        })
      );
    }

    if (terms) {
      statementQuery.condition = statementQuery.and(
        statementQuery.condition,
        statementQuery.createCondition({
          fieldId: 'terms',
          operator: query.Operator.ANY_OF,
          values: [terms.value],
        })
      );
    }

    // Create columns
    // First, create tranDate column for sorting
    const tranDateCol: query.Column = statementQuery.createColumn({
      fieldId: 'trandate',
      alias: 'tranDate',
    });

    statementQuery.columns = [
      statementQuery.createColumn({
        fieldId: 'id',
      }),
      statementQuery.createColumn({
        fieldId: 'type',
        alias: 'typeCode',
      }),
      statementQuery.createColumn({
        fieldId: 'transactionlines.subsidiary',
        alias: 'subsidiaryId',
      }),
      statementQuery.createColumn({
        fieldId: 'transactionlines.subsidiary.name',
        alias: 'subsidiaryName',
      }),
      statementQuery.createColumn({
        fieldId: 'tranid',
        alias: 'documentNumber',
      }),
      tranDateCol,
      statementQuery.createColumn({
        fieldId: 'duedate',
        alias: 'dueDate',
      }),
      statementQuery.createColumn({
        fieldId: 'terms',
        alias: 'termsId',
      }),
      statementQuery.createColumn({
        fieldId: 'terms.name',
        alias: 'termsName',
      }),
      statementQuery.createColumn({
        formula: 'trunc(CAST_TO_DATE(CURRENT_DATE)-{duedate})',
        type: query.ReturnType.FLOAT,
        alias: 'ageFromDueDate',
      }),
      statementQuery.createColumn({
        fieldId: 'currency',
        alias: 'currencyId',
      }),
      statementQuery.createColumn({
        fieldId: 'currency.name',
        alias: 'currencyName',
      }),
      statementQuery.createColumn({
        formula: `case when {type} = 'CustInvc' then {foreignamountunpaid} when {type} = 'CustCred' then ({foreignpaymentamountunused} * (-1)) when {type} = 'CustPymt' then ({foreignpaymentamountunused} * (-1)) else 0 end`,
        type: query.ReturnType.FLOAT,
        alias: 'txnOpenBalance',
      }),
      statementQuery.createColumn({
        fieldId: 'entity',
        alias: 'customerId',
      }),
      customerJoin.createColumn({
        fieldId: 'companyname',
        alias: 'customerName',
      }),
      customerJoin.createColumn({
        fieldId: 'email',
        alias: 'customerEmail',
      }),
      statementQuery.createColumn({
        fieldId: 'status',
        alias: 'statusCode',
      }),
      statementQuery.createColumn({
        fieldId: 'foreigntotal',
        alias: 'txnTotal',
      }),
    ];

    // Set column sorts
    statementQuery.sort = [
      statementQuery.createSort({
        column: tranDateCol,
        ascending: true,
      }),
    ];

    // Create table header cells
    const headerCells: NsReactTableHeaderProps[] = [
      {
        id: 'customer',
        label: 'Company Name',
        appWidth: 2,
        xlsxWidth: 19,
      },
      {
        id: 'subsidiary',
        label: 'Subsidiary',
        appWidth: 2,
        xlsxWidth: 19,
      },
      {
        id: 'recipient',
        label: 'Recipient',
        appWidth: 2,
        visible: false,
        xlsxWidth: 19,
      },
      {
        id: 'documentNumber',
        label: 'Document Number',
        appWidth: 1,
        xlsxWidth: 17,
      },
      {
        id: 'type',
        label: 'Transaction Type',
        appWidth: 1,
        xlsxWidth: 15,
      },
      {
        id: 'tranDate',
        label: 'Date',
        appWidth: 1,
        xlsxWidth: 10,
      },
      {
        id: 'dueDate',
        label: 'Due Date',
        appWidth: 1,
        xlsxWidth: 10,
      },
      {
        id: 'terms',
        label: 'Terms',
        appWidth: 1,
        xlsxWidth: 13,
      },
      {
        id: 'ageFromDueDate',
        label: 'Age',
        appWidth: 1,
        xlsxWidth: 8,
      },
      {
        id: 'currency',
        label: 'Currency',
        appWidth: 1,
        xlsxWidth: 9,
      },
      {
        id: 'txnOpenBalance',
        label: 'Transaction Open Balance',
        align: TableCellAlignOptions.RIGHT,
        appWidth: 2,
        xlsxWidth: 21,
      },
      {
        id: 'txnTotal',
        label: 'Transaction Amount',
        appWidth: 2,
        xlsxWidth: 21,
      },
    ];

    // Run the query as a paged query with 1000 results per page
    const pagedData: query.PagedData = statementQuery.runPaged({
      pageSize: 1000,
    });

    log.debug('Page Count', pagedData.pageRanges.length);
    log.debug('Result Count', pagedData.count);

    // Fetch results using an iterator
    const tableRows: NsReactTableRowProps[] = [];
    const iterator = pagedData.iterator();
    iterator.each(resultPage => {
      const currentPage = resultPage.value;
      const pageData = currentPage.data;
      const results = pageData.asMappedResults();
      log.debug('Current Page Result Count', results.length);
      if (results && results.length) {
        // Iterate through each result and cast it to NsReactTableRowProps interface
        results.forEach((r: NetsuiteQueryResult, index: number) => {
          r.customer =
            r.customerId && r.customerName
              ? {
                  value: r.customerId.toString(),
                  label: r.customerName.toString(),
                }
              : null;
          // Get the primaryemail recipients
          const customerEmail: string | null = r.customerEmail
            ? r.customerEmail.toString().trim()
            : null;
          r.recipient = customerEmail;
          // Group select type columns
          r.subsidiary =
            r.subsidiaryId && r.subsidiaryName
              ? {
                  value: r.subsidiaryId.toString(),
                  label: r.subsidiaryName.toString(),
                }
              : null;
          r.type = r.typeCode
            ? {
                value: r.typeCode.toString(),
                label:
                  NetsuiteQueryTransactionType[
                    r.typeCode.toString() as keyof typeof NetsuiteQueryTransactionType
                  ],
              }
            : null;
          r.status =
            r.typeCode && r.statusCode
              ? {
                  value: r.typeCode.toString() + ':' + r.statusCode,
                  label:
                    NetsuiteQueryTransactionStatus[
                      (r.typeCode.toString() +
                        ':' +
                        r.statusCode) as keyof typeof NetsuiteQueryTransactionStatus
                    ],
                }
              : null;
          r.terms =
            r.termsId && r.termsName
              ? {
                  value: r.termsId.toString(),
                  label: r.termsName.toString(),
                }
              : null;
          r.currency =
            r.currencyId && r.currencyName
              ? {
                  value: r.currencyId.toString(),
                  label: r.currencyName.toString(),
                }
              : null;
          const row: NsReactTableRowProps = getTableRowFromQueryResult(
            r,
            index,
            headerCells
          );
          tableRows.push(row);
        });
      }
      return true;
    });
    log.debug('Populated tableRows', tableRows);

    return { headerCells, tableRows };
  } catch (e) {
    log.error('Error in getConsolidatedStatementData', e);
  }
};

export const sendStatementEmail = (props: {
  fileId: number;
  customer: NsReactSelectOption;
  primaryRecipient: string;
  attachToRecord: NetsuiteRecord;
  rows: NsReactTableRowProps[];
  subsidiaryId: number;
}) => {
  log.debug('Entered sendStatementEmail', props);

  const templateId = runtime.getCurrentScript().getParameter({
    name: 'custscript_sr_email_template_id',
  }) as number;

  const senderId = runtime.getCurrentScript().getParameter({
    name: 'custscript_sr_email_sender_id',
  }) as number;

  // Map incoming rows to template open transaction data rows
  const templateRows: NsReactTableRowProps[] = props.rows
    .filter(
      r =>
        (r.type as unknown as NsReactSelectOption).value === 'CustInvc' &&
        (r.txnOpenBalance as number) > 0
    )
    .map(r => {
      return {
        id: r.id,
        type: r.type,
        tranid: r.documentNumber,
        trandate: r.tranDate,
        duedate: r.dueDate,
        daysoverdue: r.ageFromDueDate,
        currency: r.currency ? (r.currency as NsReactSelectOption).label : '',
        fxamountremaining: r.txnOpenBalance,
      };
    });

  const transactionData = {
    companyname: props.customer.label,
    today: format.format({
      value: new Date(),
      type: format.Type.DATE,
    }),
    list: templateRows,
  };

  // If no template found, log error
  if (templateId === null || templateId === -1) {
    log.error('No template found for subsidiary', props.subsidiaryId);
    return `Error Sending Statement Email - Customer: ${props.customer.label} - No email template found for subsidiary ${props.subsidiaryId}`;
  }
  // If no sender found, log error
  if (senderId === null || senderId === -1) {
    log.error('No sender found for subsidiary', props.subsidiaryId);
    return `Error Sending Statement Email - Customer: ${props.customer.label} - No email sender found for subsidiary ${props.subsidiaryId}`;
  }
  // If template found, use it to send email
  const template: record.Record = record.load({
    id: templateId,
    type: record.Type.EMAIL_TEMPLATE,
  });

  const renderer = render.create();

  // Get body content
  const bodyTemplateContent: record.FieldValue = template.getValue({
    fieldId: 'content',
  });
  renderer.templateContent = bodyTemplateContent
    ? bodyTemplateContent.toString()
    : '';
  renderer.addCustomDataSource({
    format: render.DataSource.JSON,
    alias: 'transaction',
    data: JSON.stringify(transactionData),
  });
  const bodyContent: string = renderer.renderAsString();

  // Get subject content
  const subjectTemplateContent: record.FieldValue = template.getValue({
    fieldId: 'subject',
  });
  renderer.templateContent = subjectTemplateContent
    ? subjectTemplateContent.toString()
    : '';
  renderer.addCustomDataSource({
    format: render.DataSource.JSON,
    alias: 'transaction',
    data: JSON.stringify(transactionData),
  });
  const subjectContent: string = renderer.renderAsString();

  const fileObj: file.File = file.load({
    id: props.fileId,
  });

  email.send({
    author: senderId,
    recipients: props.primaryRecipient,
    subject: subjectContent,
    body: bodyContent,
    attachments: [fileObj],
    relatedRecords: { entityId: parseInt(props.customer.value.toString(), 10) },
  });

  log.debug({
    title: 'Email Send Complete',
    details: subjectContent,
  });

  const lastEmail: NetsuiteEmail | undefined = getLastEmailAttachedToRecord(
    props.attachToRecord,
    subjectContent
  );

  if (lastEmail) {
    lastEmail.attachmentUrl = fileObj.url;
    lastEmail.attachmentName = fileObj.name;
    return lastEmail;
  }
};

export const getLastEmailAttachedToRecord = (
  record: NetsuiteRecord,
  subject?: string
) => {
  log.debug('Entered getLastEmailAttachedToRecord', record);

  if (!record.type) {
    return;
  }

  const emailSearch: search.Search = search.create({
    type: record.type.toString(),
    filters: [
      ['internalid', 'anyof', record.id],
      'AND',
      ['messages.messagedate', 'onorafter', 'minutesago5'],
    ],
    columns: [
      search.createColumn({
        name: 'internalid',
        join: 'messages',
      }),
      search.createColumn({
        name: 'messagedate',
        join: 'messages',
        sort: search.Sort.DESC,
      }),
      search.createColumn({
        name: 'recipientemail',
        join: 'messages',
      }),
      search.createColumn({
        name: 'subject',
        join: 'messages',
      }),
    ],
  });

  if (subject) {
    emailSearch.filters.push(
      search.createFilter({
        name: 'subject',
        join: 'messages',
        operator: search.Operator.CONTAINS,
        values: subject,
      })
    );
  }

  const results = emailSearch.run();
  if (results) {
    const firstResult = results.getRange({
      start: 0,
      end: 1,
    })[0];
    log.debug('Retrieved email result', { found: Boolean(firstResult) });
    if (firstResult) {
      const emailId: number = parseInt(
        firstResult
          .getValue({
            name: 'internalid',
            join: 'messages',
          })
          .toString()
      );
      const sentDate: string = firstResult
        .getValue({
          name: 'messagedate',
          join: 'messages',
        })
        .toString();
      const primaryRecipients: string = firstResult
        .getValue({
          name: 'recipientemail',
          join: 'messages',
        })
        .toString();
      const subject: string = firstResult
        .getValue({
          name: 'subject',
          join: 'messages',
        })
        .toString();

      const lastEmail: NetsuiteEmail = new NetsuiteEmail(emailId);
      lastEmail.sentDate = sentDate;
      lastEmail.primaryRecipients = primaryRecipients;
      lastEmail.subject = subject;
      return lastEmail;
    }
  }
};

export const getLastEmailToPrimaryRecipientSearch = (
  recipientEmail: string,
  subject?: string
) => {
  log.debug(
    'Entered getLastEmailToPrimaryRecipientSearch - ' + recipientEmail,
    subject
  );

  const emailSearch: search.Search = search.create({
    type: search.Type.MESSAGE,
    filters: [
      ['recipientemail', 'contains', recipientEmail],
      'AND',
      ['messagedate', 'onorafter', 'minutesago5', 'minutesago1'],
    ],
    columns: [
      'view',
      search.createColumn({
        name: 'messagedate',
        sort: search.Sort.DESC,
      }),
      'recipientemail',
      'cc',
      'subject',
    ],
  });
  if (subject) {
    emailSearch.filters.push(
      search.createFilter({
        name: 'subject',
        operator: search.Operator.CONTAINS,
        values: subject,
      })
    );
  }

  const results = emailSearch.run();
  if (results) {
    const firstResult = results.getRange({
      start: 0,
      end: 1,
    })[0];
    log.debug('Retrieved email result', { found: Boolean(firstResult) });
    if (firstResult) {
      const emailId: number = parseInt(firstResult.id.toString(), 10);
      const sentDate: string = firstResult.getValue('messagedate').toString();
      const primaryRecipients: string = firstResult
        .getValue('recipientemail')
        .toString();
      const subject: string = firstResult.getValue('subject').toString();

      const lastEmail: NetsuiteEmail = new NetsuiteEmail(emailId);
      lastEmail.sentDate = sentDate;
      lastEmail.primaryRecipients = primaryRecipients;
      lastEmail.subject = subject;
      return lastEmail;
    }
  }
};

export const getLastEmailToPrimaryRecipientQuery = (
  recipientEmail: string,
  subject?: string
) => {
  log.debug(
    'Entered getLastEmailToPrimaryRecipientQuery - ' + recipientEmail,
    subject
  );

  const emailQuery = query.create({
    type: query.Type.SENT_EMAIL,
  });
  emailQuery.condition = emailQuery.and(
    emailQuery.createCondition({
      fieldId: 'to',
      operator: query.Operator.CONTAIN,
      values: recipientEmail,
    }),
    emailQuery.createCondition({
      formula:
        '(cast_to_date(current_timestamp) - cast_to_date({sentdate})) * 24 * 60',
      type: query.ReturnType.FLOAT,
      operator: query.Operator.LESS,
      values: [5],
    })
  );

  if (subject) {
    emailQuery.condition = emailQuery.and(
      emailQuery.condition,
      emailQuery.createCondition({
        fieldId: 'subject',
        operator: query.Operator.CONTAIN,
        values: subject,
      })
    );
  }

  const sentDateCol: query.Column = emailQuery.createColumn({
    fieldId: 'datetime',
    alias: 'sentDate',
  });

  emailQuery.columns = [
    sentDateCol,
    emailQuery.createColumn({
      fieldId: 'id',
    }),
    emailQuery.createColumn({
      fieldId: 'to',
      alias: 'primaryRecipients',
    }),
    emailQuery.createColumn({
      fieldId: 'subject',
    }),
  ];

  emailQuery.sort = [
    emailQuery.createSort({
      column: sentDateCol,
      ascending: false,
    }),
  ];

  const results = emailQuery.run().asMappedResults();
  log.debug('Retrieved recent email count', results.length);
  if (results && results.length > 0) {
    const lastResult = results[0];
    if (lastResult) {
      const emailId: number = lastResult.id
        ? parseInt(lastResult.id.toString(), 10)
        : -1;
      const sentDate: string = lastResult.sentDate
        ? lastResult.sentDate.toString()
        : '';
      const primaryRecipients: string = lastResult.primaryRecipients
        ? lastResult.primaryRecipients.toString()
        : '';
      const subject: string = lastResult.subject
        ? lastResult.subject.toString()
        : '';

      const lastEmail: NetsuiteEmail = new NetsuiteEmail(emailId);
      lastEmail.sentDate = sentDate;
      lastEmail.primaryRecipients = primaryRecipients;
      lastEmail.subject = subject;
      return lastEmail;
    }
  }
};

const getTableRowFromQueryResult = (
  r: NetsuiteQueryResult,
  index: number,
  headerCells: NsReactTableHeaderProps[]
): NsReactTableRowProps => {
  const row: NsReactTableRowProps = {
    id: r.id ? parseInt(r.id.toString(), 10) : index,
    type: r.type ? r.type.toString() : 'undefined',
  };

  headerCells.forEach(header => {
    row[header.id] = r[header.id] ? r[header.id] : null;
  });

  return row;
};
