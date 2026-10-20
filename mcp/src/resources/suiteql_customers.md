# NetSuite: Querying Customers With SuiteQL

SuiteQL allows you to run SQL-like queries against NetSuite customer records with support for JOINs to related data like addresses, transactions, and financial information.

## Understanding the Customer Table

NetSuite customer records are stored in the `Customer` table and can be joined with various related tables to get comprehensive customer information including:

- Billing and shipping addresses
- Transaction history
- Financial information (balances, credit limits)
- Contact information
- Sales representatives

## Customer Financial Queries

### Customer Account Balances and Credit Information

This query returns customers with their credit limits, payment terms, and current balances:

```sql
SELECT
    Customer.EntityID AS ID,
    Customer.CompanyName AS Name,
    Customer.CreditLimit,
    Customer.OnCreditHold,
    BUILTIN.DF( Customer.Terms ) AS PaymentTerms,
    BUILTIN.DF( Customer.SalesRep ) AS SalesRep,
    Customer.BalanceSearch AS BalanceTotal,
    Customer.OverdueBalanceSearch AS BalancePastDue
FROM
    Customer
WHERE
    Customer.IsInactive = 'F'
ORDER BY
    Customer.EntityID
```

### Customers with Past Due Balances

To find customers with overdue balances for collections purposes:

```sql
SELECT
    Customer.EntityID AS ID,
    Customer.CompanyName AS Name,
    Customer.CreditLimit,
    Customer.OnCreditHold,
    BUILTIN.DF( Customer.Terms ) AS PaymentTerms,
    BUILTIN.DF( Customer.SalesRep ) AS SalesRep,
    Customer.BalanceSearch AS BalanceTotal,
    Customer.OverdueBalanceSearch AS BalancePastDue
FROM
    Customer
WHERE
    Customer.IsInactive = 'F'
    AND Customer.OverdueBalanceSearch > 0
ORDER BY
    Customer.OverdueBalanceSearch DESC
```

## Customer Address Queries

### Customers with Billing Addresses

This query returns customers and their default billing addresses:

```sql
SELECT
    Customer.EntityID AS ID,
    Customer.CompanyName AS Name,
    Customer.CreditLimit,
    Customer.OnCreditHold,
    BUILTIN.DF( Customer.Terms ) AS PaymentTerms,
    BUILTIN.DF( Customer.SalesRep ) AS SalesRep,
    Customer.BalanceSearch AS BalanceTotal,
    Customer.OverdueBalanceSearch AS BalancePastDue,
    BillToAddress.Addressee AS BillToAddressee,
    BillToAddress.Addr1 As BillToAddress1,
    BillToAddress.Addr2 As BillToAddress2,
    BillToAddress.Addr3 As BillToAddress3,
    BillToAddress.City As BillToCity,
    BillToAddress.State As BillToState,
    BillToAddress.Zip As BillToZip,
    BillToAddress.Country As BillToCountry,
    BillToAddress.Attention As BillToAttention
FROM
    Customer
    LEFT OUTER JOIN EntityAddressbook AS DefaultBilling ON
        ( DefaultBilling.Entity = Customer.ID )
        AND ( DefaultBilling.defaultbilling = 'T' )
    LEFT OUTER JOIN EntityAddress AS BillToAddress ON
        ( BillToAddress.nkey = DefaultBilling.AddressBookAddress )
WHERE
    Customer.IsInactive = 'F'
ORDER BY
    Customer.EntityID
```

### Customers with Both Billing and Shipping Addresses

To get both billing and shipping addresses for customers:

```sql
SELECT
    Customer.EntityID AS ID,
    Customer.CompanyName AS Name,
    BillToAddress.Addr1 As BillToAddress1,
    BillToAddress.City As BillToCity,
    BillToAddress.State As BillToState,
    BillToAddress.Zip As BillToZip,
    ShipToAddress.Addr1 As ShipToAddress1,
    ShipToAddress.City As ShipToCity,
    ShipToAddress.State As ShipToState,
    ShipToAddress.Zip As ShipToZip
FROM
    Customer
    LEFT OUTER JOIN EntityAddressbook AS DefaultBilling ON
        ( DefaultBilling.Entity = Customer.ID )
        AND ( DefaultBilling.defaultbilling = 'T' )
    LEFT OUTER JOIN EntityAddress AS BillToAddress ON
        ( BillToAddress.nkey = DefaultBilling.AddressBookAddress )
    LEFT OUTER JOIN EntityAddressbook AS DefaultShipping ON
        ( DefaultShipping.Entity = Customer.ID )
        AND ( DefaultShipping.defaultshipping = 'T' )
    LEFT OUTER JOIN EntityAddress AS ShipToAddress ON
        ( ShipToAddress.nkey = DefaultShipping.AddressBookAddress )
WHERE
    Customer.IsInactive = 'F'
ORDER BY
    Customer.EntityID
```

## Customer Transaction Queries

### Customer Transaction Ledger

This query generates a transaction ledger for a specific customer:

```sql
SELECT
    Transaction.TranDate,
    Transaction.ID AS Transaction,
    BUILTIN.DF( Transaction.Type ) AS Type,
    Transaction.TranID,
    Transaction.OtherRefNum,
    Transaction.ForeignTotal,
    BUILTIN.DF( Transaction.Currency ) AS Currency,
    REPLACE( BUILTIN.DF( Transaction.Status ), BUILTIN.DF( Transaction.Type ) || ' : ', '' ) AS Status,
    BUILTIN.DF( Mainline.CreatedFrom ) AS CreatedFrom
FROM
    Transaction
    INNER JOIN TransactionLine AS Mainline ON
        ( Mainline.Transaction = Transaction.ID )
        AND ( Mainline.MainLine = 'T' )
WHERE
    Transaction.Entity = 237  -- Replace with specific customer ID
    AND Transaction.Void = 'F'
    AND Transaction.Voided = 'F'
ORDER BY
    Transaction.TranDate DESC,
    Transaction.TranID DESC
```

### Recent Customer Invoices

This query returns all customer invoices issued in the past 30 days:

```sql
SELECT
    Transaction.ID AS Invoice,
    Transaction.TranID AS InvoiceNumber,
    Transaction.TranDate AS InvoiceDate,
    Transaction.Entity AS Customer,
    BUILTIN.DF( Transaction.Entity ) AS CustomerName,
    Transaction.OtherRefNum AS CustomerPONumber,
    TransactionLine.CreatedFrom AS SalesOrder,
    BUILTIN.DF( TransactionLine.CreatedFrom ) AS SONumber,
    Transaction.Employee AS SalesRep,
    BUILTIN.DF( Transaction.Employee ) AS SalesRepName,
    Transaction.ForeignTotal AS TotalAmount,
    REPLACE( BUILTIN.DF( Transaction.Status ), 'Invoice : ', '' ) AS Status,
    Transaction.ForeignAmountUnpaid AS BalanceDue,
    Transaction.DueDate
FROM
    Transaction
    INNER JOIN TransactionLine ON
        ( TransactionLine.Transaction = Transaction.ID )
        AND ( TransactionLine.MainLine = 'T' )
    LEFT OUTER JOIN Transaction AS SalesOrder ON
        ( SalesOrder.ID = TransactionLine.CreatedFrom )
WHERE
    Transaction.Type = 'CustInvc'
    AND Transaction.TranDate >= BUILTIN.RELATIVE_RANGES( 'DAGO30', 'START' )
ORDER BY
    Transaction.TranID DESC
```

### Customer Invoices by Date Range

To get customer invoices within a specific date range:

```sql
SELECT
    Transaction.ID AS Invoice,
    Transaction.TranID AS InvoiceNumber,
    Transaction.TranDate AS InvoiceDate,
    BUILTIN.DF( Transaction.Entity ) AS CustomerName,
    Transaction.ForeignTotal AS TotalAmount,
    Transaction.ForeignAmountUnpaid AS BalanceDue,
    REPLACE( BUILTIN.DF( Transaction.Status ), 'Invoice : ', '' ) AS Status
FROM
    Transaction
    INNER JOIN TransactionLine ON
        ( TransactionLine.Transaction = Transaction.ID )
        AND ( TransactionLine.MainLine = 'T' )
WHERE
    Transaction.Type = 'CustInvc'
    AND Transaction.TranDate BETWEEN TO_DATE('01/01/2024') AND TO_DATE('01/31/2024')
    AND Transaction.Void = 'F'
    AND Transaction.Voided = 'F'
ORDER BY
    Transaction.TranDate DESC,
    Transaction.TranID DESC
```

## Customer Contact Information

### Customers with Primary Contact Details

To get customer contact information including phone and email:

```sql
SELECT
    Customer.EntityID AS ID,
    Customer.CompanyName AS Name,
    Customer.Phone,
    Customer.Email,
    Customer.Fax,
    Customer.URL AS Website,
    BUILTIN.DF( Customer.SalesRep ) AS SalesRep,
    Customer.DateCreated,
    Customer.LastModifiedDate
FROM
    Customer
WHERE
    Customer.IsInactive = 'F'
ORDER BY
    Customer.EntityID
```

## Customer Sales Analysis

### Customer Sales by Sales Rep

To analyze customers by their assigned sales representatives:

```sql
SELECT
    BUILTIN.DF( Customer.SalesRep ) AS SalesRep,
    COUNT( Customer.ID ) AS CustomerCount,
    SUM( Customer.BalanceSearch ) AS TotalBalance,
    SUM( Customer.OverdueBalanceSearch ) AS TotalOverdue,
    AVG( Customer.CreditLimit ) AS AverageCreditLimit
FROM
    Customer
WHERE
    Customer.IsInactive = 'F'
    AND Customer.SalesRep IS NOT NULL
GROUP BY
    Customer.SalesRep,
    BUILTIN.DF( Customer.SalesRep )
ORDER BY
    TotalBalance DESC
```

### Top Customers by Balance

To find your top customers by current balance:

```sql
SELECT
    Customer.EntityID AS ID,
    Customer.CompanyName AS Name,
    Customer.BalanceSearch AS Balance,
    Customer.CreditLimit,
    BUILTIN.DF( Customer.Terms ) AS PaymentTerms,
    BUILTIN.DF( Customer.SalesRep ) AS SalesRep
FROM
    Customer
WHERE
    Customer.IsInactive = 'F'
    AND Customer.BalanceSearch > 0
    AND RowNum <= 50
ORDER BY
    Customer.BalanceSearch DESC
```

## Key Fields in Customer Queries

### Important Customer Fields

- `EntityID` - Customer number/identifier
- `CompanyName` - Customer company name
- `IsInactive` - Whether customer is active (F = active, T = inactive)
- `BalanceSearch` - Current balance total
- `OverdueBalanceSearch` - Past due balance amount
- `CreditLimit` - Customer's credit limit
- `OnCreditHold` - Whether customer is on credit hold
- `Terms` - Payment terms (use BUILTIN.DF for readable name)
- `SalesRep` - Assigned sales representative (use BUILTIN.DF for name)
- `Currency` - Customer's currency
- `DateCreated` - When customer record was created
- `LastModifiedDate` - Last modification date

### Address-Related Tables

- `EntityAddressbook` - Links customers to their addresses
- `EntityAddress` - Contains actual address details
- Use `defaultbilling = 'T'` to get default billing address
- Use `defaultshipping = 'T'` to get default shipping address

## Best Practices for Customer Queries

1. **Always filter inactive customers** - Use `Customer.IsInactive = 'F'` unless you specifically need inactive customers
2. **Use LEFT OUTER JOIN for addresses** - Not all customers have addresses configured
3. **Use BUILTIN.DF for readable values** - Convert internal IDs to display names for sales reps, terms, etc.
4. **Filter voided transactions** - Include `Transaction.Void = 'F' AND Transaction.Voided = 'F'` when querying transactions
5. **Consider performance** - Use appropriate WHERE clauses and RowNum <= limit when querying large datasets
6. **Date filtering** - Use `BUILTIN.RELATIVE_RANGES` for dynamic date ranges or `TO_DATE` for specific dates

## Common Use Cases

- **Collections reporting** - Query customers with overdue balances
- **Sales territory analysis** - Group customers by sales rep or location
- **Customer statements** - Generate transaction ledgers for specific customers
- **Address validation** - Export customer addresses for shipping or marketing
- **Credit management** - Monitor customers approaching credit limits
- **Customer aging** - Analyze customer payment patterns and aging
