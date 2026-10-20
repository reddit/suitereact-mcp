---
name: suiteql-cookbook
description: Generate production-ready SuiteQL queries from natural language. Leverages the NetSuite MCP tools (suiteql_query_assistant, execute_suiteql_query, get_netsuite_record_schema) to look up record schemas, validate queries, and iteratively build complex SuiteQL. Use when the user asks to write, debug, or optimize a SuiteQL query.
---

# SuiteQL Cookbook

Generate, validate, and optimize SuiteQL queries using the NetSuite MCP tools as a knowledge backend.

## Prerequisites

- The `netsuite` MCP server must be running and authenticated
- The user provides a natural language question about NetSuite data

## Available MCP Tools

| Tool                         | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `suiteql_query_assistant`    | RAG-powered query guidance — field names, JOINs, gotchas |
| `execute_suiteql_query`      | Run a query against the target NetSuite account          |
| `get_netsuite_record_schema` | Fetch record metadata (fields, types, sublists)          |

## Workflow

### Step 1: Understand the Request

Parse the user's natural language request. Identify:

- **Target records** — What record types are involved? (e.g., transactions, customers, items)
- **Desired fields** — What data do they want?
- **Filters** — Date ranges, statuses, types, etc.
- **Aggregations** — SUM, COUNT, GROUP BY, etc.
- **Joins** — Cross-record relationships needed

### Step 2: Research via RAG

Call `suiteql_query_assistant` with:

- `userQuery`: The user's question rephrased for optimal RAG retrieval
- `ragCategory`: Choose based on the query type:
  - `suiteql_pure` — Query syntax questions
  - `suiteql` — General SuiteQL including record-specific patterns
  - `netsuite_records` — Record structure and relationships
- `includeExamples`: `true` for first queries, `false` for iterations
- `includeFieldMappings`: `true` when field names are uncertain

Review the RAG response for:

- Correct field internal IDs
- Required JOINs and their syntax
- Common pitfalls (e.g., `mainline` belongs to `TransactionLine`, not `Transaction`; `isinactive = 'F'` filters)

### Step 3: Schema Validation (when needed)

If the RAG response is insufficient or you need to confirm field names:

1. Call `get_netsuite_record_schema` with the record type
2. Cross-reference field names from the schema with your draft query
3. Note field types for proper filtering (text fields need quotes, booleans use 'T'/'F')

### Step 4: Build the Query

Construct the SuiteQL query following these rules:

- **Use ROWNUM for bounded results**, not `LIMIT`. For ordered results, put `ORDER BY` in an inner query and `WHERE ROWNUM <= 100` in the outer query. Include a unique tie-breaker in the inner ordering. A same-level `ROWNUM` filter runs before sorting and does not reliably select the latest/top rows. See [Oracle's ROWNUM reference](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/sqlrf/ROWNUM-Pseudocolumn.html).
- **Qualify ambiguous columns** with table aliases
- **Use built-in functions** for dates: `TO_DATE()`, `TO_CHAR()`, `BUILTIN.DF()`
- **Handle NULLs** explicitly: `NVL(field, default)`
- **Use BUILTIN.DF()** for display values of list fields

### Step 5: Execute and Validate

1. Run the query with `execute_suiteql_query`
2. Review results for correctness
3. If errors occur, read the error message, adjust, and retry
4. Common fixes:
   - Field name typos → re-check with `get_netsuite_record_schema`
   - JOIN issues → verify relationship via RAG
   - Type mismatches → quote strings, unquote numbers

### Step 6: Present Results

Return to the user:

1. The **final query** (formatted and commented)
2. **Sample results** (first few rows)
3. **Notes** on any caveats or limitations
4. **Optimization suggestions** if the query could be improved

---

## Common Patterns

### Transaction Queries

`Transaction` already contains header rows, so this query needs no `mainline`
filter. When joining `TransactionLine` to retrieve header-line fields, use
`tl.mainline = 'T'` on that joined table instead.

```sql
SELECT *
FROM (
  SELECT
    t.tranid,
    t.trandate,
    BUILTIN.DF(t.type) AS type,
    BUILTIN.DF(t.status) AS status,
    BUILTIN.DF(t.entity) AS entity_name,
    t.foreigntotal
  FROM Transaction t
  WHERE t.trandate >= TO_DATE('2024-01-01', 'YYYY-MM-DD')
  ORDER BY t.trandate DESC, t.id DESC
)
WHERE ROWNUM <= 100
```

### Transaction with Lines

```sql
SELECT *
FROM (
  SELECT
    t.tranid,
    tl.linesequencenumber,
    BUILTIN.DF(tl.item) AS item_name,
    tl.quantity,
    tl.rate,
    tl.amount
  FROM TransactionLine tl
  INNER JOIN Transaction t ON t.id = tl.transaction
  WHERE t.type = 'SalesOrd'
    AND tl.mainline = 'F'
    AND t.trandate >= TO_DATE('2024-01-01', 'YYYY-MM-DD')
  ORDER BY t.tranid, t.id, tl.linesequencenumber, tl.id
)
WHERE ROWNUM <= 200
```

### Customer Lookup

```sql
SELECT *
FROM (
  SELECT
    c.id,
    c.companyname,
    c.email,
    BUILTIN.DF(c.category) AS category,
    BUILTIN.DF(c.subsidiary) AS subsidiary
  FROM Customer c
  WHERE c.isinactive = 'F'
  ORDER BY c.companyname, c.id
)
WHERE ROWNUM <= 100
```

### Saved Search Equivalent

```sql
SELECT *
FROM (
  SELECT
    t.tranid AS "Document Number",
    t.trandate AS "Date",
    BUILTIN.DF(t.entity) AS "Name",
    BUILTIN.DF(t.status) AS "Status",
    t.foreigntotal AS "Amount"
  FROM Transaction t
  WHERE t.type = 'CustInvc'
    AND BUILTIN.DF(t.status) != 'Voided'
    AND t.trandate BETWEEN TO_DATE('2024-01-01','YYYY-MM-DD') AND TO_DATE('2024-12-31','YYYY-MM-DD')
  ORDER BY t.trandate DESC, t.id DESC
)
WHERE ROWNUM <= 500
```

---

## Tips for the Agent

- Always start with `suiteql_query_assistant` before trying to write a query from scratch
- When in doubt about a field name, use `get_netsuite_record_schema` — don't guess
- If a query returns 0 rows, loosen filters and retry to verify the base query works
- Use `BUILTIN.DF()` for any list/record reference field to get display values
- Remember: NetSuite SuiteQL is Oracle-flavored SQL with custom built-in functions
