export const demoScripts = [
  {
    value: '101',
    label: 'Invoice sync',
    scriptId: 'customscript_demo_invoice_sync',
  },
  {
    value: '102',
    label: 'Payment reconciliation',
    scriptId: 'customscript_demo_payment_reconciliation',
  },
  {
    value: '103',
    label: 'Customer export',
    scriptId: 'customscript_demo_customer_export',
  },
];
export const demoDeployments = [
  {
    value: '201',
    label: 'Invoice sync · primary',
    scriptId: 'customdeploy_demo_invoice_primary',
    script: '101',
  },
  {
    value: '202',
    label: 'Invoice sync · retry',
    scriptId: 'customdeploy_demo_invoice_retry',
    script: '101',
  },
  {
    value: '203',
    label: 'Payments · daily',
    scriptId: 'customdeploy_demo_payments_daily',
    script: '102',
  },
  {
    value: '204',
    label: 'Customers · hourly',
    scriptId: 'customdeploy_demo_customers_hourly',
    script: '103',
  },
];
