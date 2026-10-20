import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';

import { NsReactHandleActionInputProps } from '../types';

dotenv.config();
const REACT_APP_NS_ACCOUNT_ID = process.env.REACT_APP_NS_ACCOUNT_ID || '';
const actionHandlerUrl = `https://${REACT_APP_NS_ACCOUNT_ID.replace('_', '-').toLowerCase()}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_sr_rl_rct_action_handler&deploy=customdeploy_sr_rl_rct_action_handler`;

const router = express.Router();

const resolveReqAll = async (deferred: Promise<any>) => {
  try {
    const res = await deferred;
    const data = tryParse(res.data);
    if (data.success) return { data: data.data, error: null };
    return { data: null, error: data };
  } catch (e: any) {
    if (e?.response?.data) {
      const parsed = tryParse(e.response.data);
      const detail =
        parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? e.message;
      return {
        data: null,
        error: {
          success: false,
          error: parsed?.error?.code ?? parsed?.name ?? 'RESTLET_ERROR',
          message: typeof detail === 'string' ? detail : JSON.stringify(detail),
          status: e.response.status,
          restletResponse: parsed,
        },
      };
    }
    return {
      data: null,
      error: {
        success: false,
        error: 'PROXY_ERROR',
        message: e?.message ?? 'Unknown proxy error',
      },
    };
  }
};

function tryParse(data: any) {
  try {
    const parsedData = JSON.parse(data);
    return parsedData;
  } catch {
    return data;
  }
}

router.post(
  '/handle-action',
  async (req: express.Request, res: express.Response) => {
    const { params, inputData } = req.body as NsReactHandleActionInputProps;
    const actionProps = params?.actionProps;
    if (!actionProps?.action || typeof actionProps.action !== 'string') {
      return res.status(400).json({ error: 'A valid action is required' });
    }
    console.warn('Proxying SuiteReact action:', actionProps.action);

    try {
      if (actionProps.action === 'resolveRecordUrls') {
        try {
          const result = handleResolveRecordUrlsLocally(
            inputData?.recordTypes ?? []
          );
          return res.json(result);
        } catch (e: any) {
          console.error('resolveRecordUrls error', e?.message);
          return res.status(400).json({ error: e?.message ?? 'Unknown error' });
        }
      }

      // All other actions: forward to NetSuite RESTlet
      const response = await resolveReqAll(
        axios.post(actionHandlerUrl, {
          elements: actionProps.elementValues,
          action: actionProps.action,
          ...inputData,
        })
      );

      if (response.error) {
        return res.status(400).json({ error: response.error });
      }

      res.json(response.data);
    } catch (e) {
      console.error('handleAction error', e);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post(
  '/handle-llm-request',
  async (req: express.Request, res: express.Response) => {
    console.warn('Proxying an LLM request');

    try {
      // Forward the request to the NetSuite LLM proxy
      const nsUrl = `https://${REACT_APP_NS_ACCOUNT_ID.replace(
        '_',
        '-'
      ).toLowerCase()}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_sr_rl_llm_proxy&deploy=customdeploy_sr_rl_llm_proxy`;

      const response = await resolveReqAll(axios.post(nsUrl, req.body));

      if (response.error) {
        return res.status(400).json({ error: response.error });
      }

      res.json(response.data);
    } catch (e) {
      console.error('handle-llm-request error', e);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/**
 * Known NetSuite URL paths per record type. Mirrors what
 * `url.resolveRecord()` returns in SuiteScript so local dev works without
 * deploying the `resolveRecordUrls` action to NetSuite.
 */
const RECORD_URL_PATHS: Record<string, string> = {
  // Entities
  customer: '/app/common/entity/custjob.nl',
  employee: '/app/common/entity/employee.nl',
  vendor: '/app/common/entity/vendor.nl',
  contact: '/app/common/entity/contact.nl',
  partner: '/app/common/entity/partner.nl',
  // Transactions
  invoice: '/app/accounting/transactions/custinvc.nl',
  salesorder: '/app/accounting/transactions/salesord.nl',
  purchaseorder: '/app/accounting/transactions/purchord.nl',
  vendorbill: '/app/accounting/transactions/vendbill.nl',
  journalentry: '/app/accounting/transactions/journal.nl',
  expensereport: '/app/accounting/transactions/exprept.nl',
  creditmemo: '/app/accounting/transactions/credmemo.nl',
  estimate: '/app/accounting/transactions/estimate.nl',
  opportunity: '/app/accounting/transactions/opprtnty.nl',
  cashsale: '/app/accounting/transactions/cashsale.nl',
  returnauthorization: '/app/accounting/transactions/rtnauth.nl',
  vendorreturnauthorization: '/app/accounting/transactions/vendrtnauth.nl',
  check: '/app/accounting/transactions/check.nl',
  vendorpayment: '/app/accounting/transactions/vendpymt.nl',
  customerpayment: '/app/accounting/transactions/custpymt.nl',
  transferorder: '/app/accounting/transactions/trnfrord.nl',
  itemfulfillment: '/app/accounting/transactions/itemship.nl',
  itemreceipt: '/app/accounting/transactions/itemrcpt.nl',
  inventoryadjustment: '/app/accounting/transactions/invadjst.nl',
  deposit: '/app/accounting/transactions/deposit.nl',
  depositapplication: '/app/accounting/transactions/depappl.nl',
};

function handleResolveRecordUrlsLocally(recordTypes: string[]): {
  domain: string;
  templates: Record<string, string>;
} {
  const accountId = REACT_APP_NS_ACCOUNT_ID.replace('_', '-').toLowerCase();
  const domain = `${accountId}.app.netsuite.com`;
  const templates: Record<string, string> = {};

  for (const rt of recordTypes) {
    const path = RECORD_URL_PATHS[rt.toLowerCase()];
    if (path) {
      templates[rt] = `https://${domain}${path}?id=`;
    } else {
      templates[rt] =
        `https://${domain}/app/common/search/searchresults.nl?rectype=${rt}&id=`;
    }
  }

  return { domain, templates };
}

router.get(
  '/record-schema/:recordType',
  async (req: express.Request, res: express.Response) => {
    const recordType = String(req.params.recordType);
    console.warn('Fetching record schema:', recordType);
    try {
      const response = await resolveReqAll(
        axios.post(actionHandlerUrl, {
          action: 'getRecordFieldSchema',
          recordType,
        })
      );
      if (response.error) {
        return res.status(400).json({ error: response.error });
      }
      res.json(response.data);
    } catch {
      console.error('record-schema request failed');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
