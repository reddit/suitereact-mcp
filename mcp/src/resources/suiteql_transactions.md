# NetSuite: Querying Transactions With SuiteQL

SuiteQL allows you to run SQL-like queries against NetSuite transaction records with support for JOINs.

## Understanding the Transaction Table

All NetSuite transactions are stored in a generic "Transaction" table, regardless of their type (Invoice, Sales Order, Purchase Order, etc.). Transactions are categorized based on their `type` field rather than being stored in separate tables.

This means that you query the same table whether you're looking for invoices, sales orders, journal entries, or any other transaction type.

## Transaction Types

### Listing All Transaction Types

To see all transaction types in your NetSuite instance:

```sql
SELECT DISTINCT
    BUILTIN.DF(type) AS Name,
    type
FROM
    transaction
ORDER BY
    BUILTIN.DF(type)
```

### Standard Transaction Types

| Transaction Type Name         | Transaction Type |
| ----------------------------- | ---------------- |
| Assembly Build                | Build            |
| Assembly Unbuild              | Unbuild          |
| Bin                           | Vendauth         |
| Bin Credit                    | VendCred         |
| Bin Payment                   | VendPymt         |
| Bin Putaway Worksheet         | BinWksht         |
| Bin Transfer                  | BinTrnfr         |
| Blanket Purchase Order        | BlankOrd         |
| Cash Sale                     | CashSale         |
| Check                         | Check            |
| Credit Card                   | CardChrg         |
| Credit Memo                   | CustCred         |
| Currency Revaluation          | FxReval          |
| Customer Deposit              | CustDep          |
| Customer Refund               | CustRfnd         |
| Deposit                       | Deposit          |
| Deposit Application           | DepAppl          |
| Expense Report                | ExpRept          |
| Inventory Adjustment          | InvAdjst         |
| Inventory Cost Revaluation    | InvReval         |
| Inventory Count               | InvCount         |
| Inventory Transfer            | InvTrnfr         |
| Inventory Worksheet           | InvWksht         |
| Invoice                       | CustInvc         |
| Item Fulfillment              | ItemShip         |
| Item Receipt                  | ItemRcpt         |
| Journal                       | Journal          |
| Lease                         | Custom           |
| Opportunity                   | Opprtnty         |
| Payment                       | CustPymt         |
| Purchase Contract             | PurchCon         |
| Purchase Order                | PurchOrd         |
| Quote                         | Estimate         |
| Request For Quote             | Rfq              |
| Requisition                   | PurchReq         |
| Return Authorization          | RtnAuth          |
| Sales Order                   | SalesOrd         |
| System Journal                | SysJrnl          |
| Transfer Order                | TrnfrOrd         |
| Vendor Prepayment             | VPrep            |
| Vendor Prepayment Application | VPrepApp         |
| Vendor Request For Quote      | VendRfq          |
| Vendor Return Authorization   | VendAuth         |
| Work Order                    | WorkOrd          |
| Work Order Close              | WOClose          |
| Work Order Completion         | WOCompl          |
| Work Order Issue              | WOIssue          |

### Identifying a Transaction's Type

If you have a transaction ID but don't know its type, use this query to get type:

```sql
SELECT
    tranid,
    BUILTIN.DF(type) AS TypeName,
    type
FROM
    transaction
WHERE
    ID = 186758
```

## Getting Transaction GL Impact

One of the most commonly requested features is the ability to get a transaction's GL (General Ledger) impact using SuiteQL. This is possible using the `TransactionAccountingLine` table, which provides access to the accounting entries that NetSuite creates for each transaction.

### The TransactionAccountingLine Table

The `TransactionAccountingLine` table contains the actual accounting entries (debits and credits) that NetSuite generates for transactions. This table is often overlooked but is essential for GL reporting and analysis.

### Basic GL Impact Query

Here's a query that replicates NetSuite's native GL Impact function:

```sql
SELECT
    Transaction.TranID,
    BUILTIN.DF( TransactionAccountingLine.AccountingBook ) AS AccountingBookName,
    BUILTIN.DF( TransactionAccountingLine.Account ) AS Account,
    TransactionAccountingLine.Debit,
    TransactionAccountingLine.Credit,
    TransactionAccountingLine.Posting,
    BUILTIN.DF( Transaction.Entity ) AS EntityName,
    TransactionLine.Memo,
    BUILTIN.DF( TransactionLine.Subsidiary ) AS Subsidiary,
    BUILTIN.DF( TransactionLine.Department ) AS Department
FROM
    Transaction
    INNER JOIN TransactionAccountingLine ON
        ( TransactionAccountingLine.Transaction = Transaction.ID )
    LEFT OUTER JOIN TransactionLine ON
        ( TransactionLine.Transaction = TransactionAccountingLine.Transaction )
        AND ( TransactionLine.ID = TransactionAccountingLine.TransactionLine )
WHERE
    ( Transaction.ID = 26254 )
    AND ( TransactionAccountingLine.Account IS NOT NULL )
ORDER BY
    TransactionAccountingLine.TransactionLine
```

### Key Points About GL Impact Queries

- The `TransactionAccountingLine` table contains the actual debits and credits for each transaction
- Use `INNER JOIN` to connect Transaction to TransactionAccountingLine
- Use `LEFT OUTER JOIN` to connect to TransactionLine for additional details like memo and department
- The `AccountingBook` field is important for Multi-Book environments
- Filter by `TransactionAccountingLine.Account IS NOT NULL` to exclude empty accounting lines
- The `Posting` field indicates whether the line is a posting transaction

### GL Impact for Multiple Transactions

To get GL impact for multiple transactions (e.g., all invoices in a date range):

```sql
SELECT
    Transaction.TranID,
    Transaction.ID,
    BUILTIN.DF( Transaction.Type ) AS TransactionType,
    BUILTIN.DF( TransactionAccountingLine.Account ) AS Account,
    TransactionAccountingLine.Debit,
    TransactionAccountingLine.Credit,
    TransactionAccountingLine.Posting,
    BUILTIN.DF( Transaction.Entity ) AS EntityName,
    Transaction.TranDate
FROM
    Transaction
    INNER JOIN TransactionAccountingLine ON
        ( TransactionAccountingLine.Transaction = Transaction.ID )
WHERE
    Transaction.Type = 'CustInvc'
    AND Transaction.TranDate BETWEEN TO_DATE('01/01/2024') AND TO_DATE('01/31/2024')
    AND TransactionAccountingLine.Account IS NOT NULL
ORDER BY
    Transaction.TranDate, Transaction.TranID, TransactionAccountingLine.TransactionLine
```

## Querying Journal Entries

Journal entries have unique characteristics that require special consideration when querying with SuiteQL. Unlike other transaction types, journal entries often lack entity associations and have multiple accounting lines that are all flagged as "mainline."

### Basic Journal Entry Query

To get journal entries for a specific accounting period:

```sql
SELECT
    Transaction.ID,
    Transaction.TranID AS DocumentNumber,
    Transaction.TranDate,
    AccountingPeriod.PeriodName AS PostingPeriod,
    Entity.EntityID,
    Transaction.Memo
FROM
    Transaction
    INNER JOIN AccountingPeriod ON
        ( AccountingPeriod.ID = Transaction.PostingPeriod )
    LEFT OUTER JOIN Entity ON
        ( Entity.ID = Transaction.Entity )
WHERE
    ( Transaction.Type = 'Journal' )
    AND ( Transaction.Voided = 'F' )
    AND ( Transaction.Void = 'F' )
    AND ( AccountingPeriod.PeriodName = 'Nov 2021' )
ORDER BY
    DocumentNumber
```

**Key Points:**

- Use `LEFT OUTER JOIN` for Entity because many journal entries don't have an associated entity
- Filter on `Transaction.Type = 'Journal'` to get only journal entries
- Include filters for `Voided = 'F'` and `Void = 'F'` to exclude voided transactions

### Journal Entry Details with Accounting Lines

To get the detailed accounting impact (debits/credits) for journal entries:

```sql
SELECT
    Transaction.ID,
    Transaction.TranID AS DocumentNumber,
    Transaction.TranDate,
    AccountingPeriod.PeriodName AS PostingPeriod,
    Entity.EntityID,
    Transaction.Memo,
    BUILTIN.DF( TransactionAccountingLine.Account ) AS Account,
    TransactionAccountingLine.Debit,
    TransactionAccountingLine.Credit
FROM
    Transaction
    INNER JOIN AccountingPeriod ON
        ( AccountingPeriod.ID = Transaction.PostingPeriod )
    LEFT OUTER JOIN Entity ON
        ( Entity.ID = Transaction.Entity )
    INNER JOIN TransactionAccountingLine ON
        ( TransactionAccountingLine.Transaction = Transaction.ID )
WHERE
    ( Transaction.Type = 'Journal' )
    AND ( Transaction.Voided = 'F' )
    AND ( Transaction.Void = 'F' )
    AND ( AccountingPeriod.PeriodName = 'Nov 2021' )
ORDER BY
    DocumentNumber
```

This query will return multiple rows per journal entry - one for each debit and credit line.

### Adding Subsidiary and Segment Information

To include subsidiary, department, class, and location information, you need to join to the TransactionLine table. However, journal entries present a unique challenge: all lines are marked as "mainline," which can cause duplicate results.

**Problem Query (causes duplicates):**

```sql
-- DON'T USE THIS - It will return excessive duplicate rows
SELECT
    Transaction.ID,
    Transaction.TranID AS DocumentNumber,
    BUILTIN.DF( TransactionAccountingLine.Account ) AS Account,
    TransactionAccountingLine.Debit,
    TransactionAccountingLine.Credit,
    BUILTIN.DF( TransactionLine.Subsidiary ) AS Subsidiary,
    BUILTIN.DF( TransactionLine.Department ) AS Department
FROM
    Transaction
    INNER JOIN TransactionAccountingLine ON
        ( TransactionAccountingLine.Transaction = Transaction.ID )
    INNER JOIN TransactionLine ON
        ( TransactionLine.Transaction = Transaction.ID )
        AND ( TransactionLine.MainLine = 'T' )
WHERE
    ( Transaction.Type = 'Journal' )
```

**Solution: Filter by LineSequenceNumber**

To avoid duplicates, join only to the TransactionLine with `LineSequenceNumber = 0`:

```sql
SELECT
    Transaction.ID,
    Transaction.TranID AS DocumentNumber,
    Transaction.TranDate,
    AccountingPeriod.PeriodName AS PostingPeriod,
    Entity.EntityID,
    Transaction.Memo,
    BUILTIN.DF( TransactionAccountingLine.Account ) AS Account,
    TransactionAccountingLine.Debit,
    TransactionAccountingLine.Credit,
    BUILTIN.DF( TransactionLine.Subsidiary ) AS Subsidiary,
    BUILTIN.DF( TransactionLine.Location ) AS Location,
    BUILTIN.DF( TransactionLine.Department ) AS Department,
    BUILTIN.DF( TransactionLine.Class ) AS Class
FROM
    Transaction
    INNER JOIN AccountingPeriod ON
        ( AccountingPeriod.ID = Transaction.PostingPeriod )
    LEFT OUTER JOIN Entity ON
        ( Entity.ID = Transaction.Entity )
    INNER JOIN TransactionAccountingLine ON
        ( TransactionAccountingLine.Transaction = Transaction.ID )
    INNER JOIN TransactionLine ON
        ( TransactionLine.Transaction = Transaction.ID )
        AND ( TransactionLine.MainLine = 'T' )
        AND ( TransactionLine.LineSequenceNumber = 0 )
WHERE
    ( Transaction.Type = 'Journal' )
    AND ( Transaction.Voided = 'F' )
    AND ( Transaction.Void = 'F' )
    AND ( AccountingPeriod.PeriodName = 'Nov 2021' )
ORDER BY
    DocumentNumber
```

### Journal Entry Best Practices

1. **Use LEFT OUTER JOIN for Entity** - Many journal entries don't have an associated entity
2. **Filter by LineSequenceNumber = 0** - Avoids duplicate rows when joining to TransactionLine for segment information
3. **Include Voided/Void filters** - Exclude voided transactions from results
4. **Consider AccountingPeriod joins** - Useful for period-based reporting
5. **Performance tip** - Filtering by `LineSequenceNumber = 0` is much more efficient than using `SELECT DISTINCT`

## Common Transaction Queries

### 1. Query a specific transaction by ID

```sql
SELECT
    transaction.id,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    transaction.entity,
    transaction.createddate
FROM
    transaction
WHERE
    transaction.id = '186758';
```

### 2. Query a specific transaction by transaction number

```sql
SELECT
    transaction.id,
    transaction.tranid,
    transaction.recordtype,
FROM
    transaction
WHERE
    transaction.tranid = 'SO38497';
```

### 3. Query invoices with specific status conditions

```sql
SELECT
    transaction.id,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    transaction.entity
FROM
    transaction
WHERE
    transaction.recordtype = 'invoice' AND (transaction.status IS NULL OR transaction.status <> 'C')
```

### 4. Query transactions within a specific date range and subsidiary

```sql
SELECT
    transaction.id,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    transaction.entity
FROM
    transaction
WHERE
    transaction.createddate BETWEEN TO_DATE('01/01/22') AND TO_DATE('01/30/22')
```

### 4. Using BUILTIN.DF for Human-Readable Values

#### Use BUILTIN.DF to decode NetSuite internal IDs to readable names:

```sql
SELECT
    transaction.id,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    BUILTIN.DF(transaction.entity) as entitydisplay,
    transaction.createddate
FROM
    transaction
WHERE
    transaction.id = '186758';
```

### 5. Using JOINs with Transactions

#### Join with entity record type

```sql
SELECT
    transaction.id,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    entity.entityid,
    BUILTIN.DF(transaction.entity) as entitydisplay,
    entity.firstname,
    entity.lastname,
    transaction.createddate
FROM
    transaction
    INNER JOIN entity ON transaction.entity = entity.id
WHERE
    transaction.id = '186758';
```

#### Join with TransactionLine and Item

```sql
SELECT
    transactionline.id,
    transactionline.item,
    BUILTIN.DF(transactionline.item) as itemname,
    transactionline.quantity,
    transactionline.rate,
    transactionline.foreignamount,
    BUILTIN.DF(transactionline.subsidiary) as subsidiarydisplay,
    transaction.id as headerid,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    entity.entityid,
    entity.companyname,
    BUILTIN.DF(transaction.entity) as entitydisplay,
    transaction.createddate
FROM
    transaction
    INNER JOIN transactionline ON transaction.id = transactionline.transaction
    INNER JOIN entity ON transaction.entity = entity.id
WHERE
    transaction.id = '186758';
```

#### Replicating Join with the Mainline Search Filter

```sql
SELECT
    transactionline.id,
    transaction.id as headerid,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    BUILTIN.DF(transactionline.subsidiary) as subsidiarydisplay,
    entity.entityid,
    entity.companyname,
    BUILTIN.DF(transaction.entity) as entitydisplay,
    CASE WHEN transactionline.mainline = 'T' THEN 'T' ELSE 'F' END as ismainline,
    transactionline.item,
    BUILTIN.DF(transactionline.item) as itemname,
    transactionline.quantity,
    transactionline.rate,
    transactionline.foreignamount,
    transaction.createddate
FROM
    transaction
    INNER JOIN transactionline ON transaction.id = transactionline.transaction
    INNER JOIN entity ON transaction.entity = entity.id
WHERE
    transaction.id = '186758'
    AND transactionline.mainline = 'T';
```

#### Advanced Join with Transaction, TransactionLine, Entity, and Item tables

```sql
SELECT
    transactionline.id,
    transaction.id as headerid,
    transaction.tranid,
    transaction.recordtype,
    transaction.type,
    BUILTIN.DF(transactionline.subsidiary) as subsidiarydisplay,
    entity.entityid,
    entity.companyname,
    BUILTIN.DF(transaction.entity) as entitydisplay,
    CASE WHEN transactionline.mainline = 'T' THEN 'T' ELSE 'F' END as ismainline,
    transactionline.item,
    BUILTIN.DF(transactionline.item) as itemname,
    item.displayname,
    item.baseprice,
    transactionline.quantity,
    transactionline.rate,
    transactionline.foreignamount,
    transaction.createddate
FROM
    transaction
    INNER JOIN transactionline ON transaction.id = transactionline.transaction
    INNER JOIN entity ON transaction.entity = entity.id
    LEFT JOIN item ON transactionline.item = item.id
WHERE
    transaction.id = '186758';
```

## Notes and Tips

- SuiteQL doesn't support wildcard field selectors (no \* syntax)
- For field information, refer to NetSuite's Schema Browser or Entity Relationship Diagram
- Use LEFT JOIN when you want to include records even if they don't have matching values in the joined table
- For Journal Entries and GL transactions, refer to the TransactionLine object for debits and credits
- Use TO_DATE function for date comparisons
