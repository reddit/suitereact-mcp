# NetSuite: Querying Employees With SuiteQL

SuiteQL allows you to run SQL-like queries against NetSuite employee records with comprehensive support for supervisors, roles, and permissions. This guide covers everything from basic employee lookups to complex security audits and compliance reporting.

## Understanding Employee Data Structure

Employee data in NetSuite spans multiple interconnected tables to provide comprehensive access control and organizational information:

- **Employee** - Core employee information (name, title, contact details)
- **EmployeeRolesForSearch** - Junction table mapping employees to their assigned roles
- **Role** - Role definitions and configurations
- **RolePermissions** - Specific permissions granted by each role

This relational structure allows for detailed security analysis and compliance reporting.

## Key Employee Tables and Fields

### Employee Table Fields

| Field Name         | Description             | Usage Notes                      |
| ------------------ | ----------------------- | -------------------------------- |
| `ID`               | Employee internal ID    | Primary key for joins            |
| `EntityID`         | Employee number/code    | Human-readable identifier        |
| `LastName`         | Employee last name      | Core identification              |
| `FirstName`        | Employee first name     | Core identification              |
| `Title`            | Job title               | Organizational information       |
| `Email`            | Employee email address  | Contact and login information    |
| `Phone`            | Phone number            | Contact information              |
| `IsInactive`       | Active status           | F = active, T = inactive         |
| `GiveAccess`       | NetSuite access granted | T = has access, F = no access    |
| `Supervisor`       | Supervisor employee ID  | References Employee.ID           |
| `Department`       | Department assignment   | Use BUILTIN.DF for readable name |
| `Location`         | Location assignment     | Use BUILTIN.DF for readable name |
| `Subsidiary`       | Subsidiary assignment   | Use BUILTIN.DF for readable name |
| `DateCreated`      | Record creation date    | Audit information                |
| `LastModifiedDate` | Last modification date  | Audit information                |

### Role and Permission Fields

| Field Name                      | Description        | Usage Notes                      |
| ------------------------------- | ------------------ | -------------------------------- |
| `Role.Name`                     | Role name          | Human-readable role identifier   |
| `Role.IsInactive`               | Role active status | F = active, T = inactive         |
| `RolePermissions.Name`          | Permission name    | Specific permission identifier   |
| `RolePermissions.PermLevel`     | Permission level   | 1=View, 2=Create, 3=Edit, 4=Full |
| `EmployeeRolesForSearch.Entity` | Employee ID        | Links to Employee.ID             |
| `EmployeeRolesForSearch.Role`   | Role ID            | Links to Role.ID                 |

## Permission Levels Reference

NetSuite uses numeric codes for permission levels:

| Level Code | Level Name | Description                      |
| ---------- | ---------- | -------------------------------- |
| 1          | View       | Read-only access                 |
| 2          | Create     | Can create new records           |
| 3          | Edit       | Can modify existing records      |
| 4          | Full       | Complete access including delete |

**Important:** Always use `BUILTIN.DF(RolePermissions.PermLevel)` to get readable permission level names.

## Basic Employee Queries

### Active Employees with NetSuite Access

This is the most common starting point for employee queries:

```sql
SELECT
    ID AS EmployeeID,
    EntityID,
    LastName,
    FirstName,
    Title,
    Email,
    Phone,
    BUILTIN.DF(Department) AS Department,
    BUILTIN.DF(Location) AS Location
FROM
    Employee
WHERE
    IsInactive = 'F'
    AND GiveAccess = 'T'
ORDER BY
    LastName, FirstName
```

### All Employees (Including Inactive)

For comprehensive audits, you may need to include all employees:

```sql
SELECT
    ID AS EmployeeID,
    EntityID,
    LastName,
    FirstName,
    Title,
    Email,
    CASE WHEN IsInactive = 'T' THEN 'Inactive' ELSE 'Active' END AS Status,
    CASE WHEN GiveAccess = 'T' THEN 'Yes' ELSE 'No' END AS HasNetSuiteAccess,
    DateCreated,
    LastModifiedDate
FROM
    Employee
ORDER BY
    LastName, FirstName
```

### Employees by Department or Location

To analyze employee distribution across organizational units:

```sql
SELECT
    BUILTIN.DF(Department) AS Department,
    COUNT(ID) AS EmployeeCount,
    COUNT(CASE WHEN GiveAccess = 'T' THEN 1 END) AS WithNetSuiteAccess
FROM
    Employee
WHERE
    IsInactive = 'F'
    AND Department IS NOT NULL
GROUP BY
    Department, BUILTIN.DF(Department)
ORDER BY
    EmployeeCount DESC
```

## Employee-Supervisor Relationships

### Employees with Their Supervisors

Understanding reporting relationships is crucial for organizational analysis:

```sql
SELECT
    e.ID AS EmployeeID,
    e.EntityID AS EmployeeNumber,
    e.LastName AS EmployeeLastName,
    e.FirstName AS EmployeeFirstName,
    e.Title AS EmployeeTitle,
    e.Email AS EmployeeEmail,
    s.EntityID AS SupervisorNumber,
    s.LastName AS SupervisorLastName,
    s.FirstName AS SupervisorFirstName,
    s.Title AS SupervisorTitle,
    s.Email AS SupervisorEmail,
    BUILTIN.DF(e.Department) AS Department
FROM
    Employee e
    LEFT OUTER JOIN Employee s ON s.ID = e.Supervisor
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
ORDER BY
    s.LastName, s.FirstName, e.LastName, e.FirstName
```

**Key Points:**

- Use `LEFT OUTER JOIN` because not all employees have supervisors
- The self-join allows you to get supervisor details from the same Employee table
- Alias tables as 'e' (employee) and 's' (supervisor) for clarity

### Organizational Hierarchy Analysis

To find employees without supervisors (potential top-level managers):

```sql
SELECT
    ID AS EmployeeID,
    EntityID,
    LastName,
    FirstName,
    Title,
    Email,
    BUILTIN.DF(Department) AS Department
FROM
    Employee
WHERE
    IsInactive = 'F'
    AND GiveAccess = 'T'
    AND Supervisor IS NULL
ORDER BY
    LastName, FirstName
```

### Direct Reports Analysis

To find how many direct reports each supervisor has:

```sql
SELECT
    s.EntityID AS SupervisorNumber,
    s.LastName AS SupervisorLastName,
    s.FirstName AS SupervisorFirstName,
    s.Title AS SupervisorTitle,
    COUNT(e.ID) AS DirectReports
FROM
    Employee s
    INNER JOIN Employee e ON e.Supervisor = s.ID
WHERE
    s.IsInactive = 'F'
    AND e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
GROUP BY
    s.ID, s.EntityID, s.LastName, s.FirstName, s.Title
ORDER BY
    DirectReports DESC, s.LastName
```

## Role Assignment Queries

### Employees with Their Assigned Roles

This query shows which roles each employee has been assigned:

```sql
SELECT
    e.ID AS EmployeeID,
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    r.Name AS RoleName,
    BUILTIN.DF(e.Department) AS Department
FROM
    Employee e
    INNER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    INNER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
ORDER BY
    e.LastName, e.FirstName, r.Name
```

### Role Distribution Analysis

To understand how roles are distributed across your organization:

```sql
SELECT
    r.Name AS RoleName,
    COUNT(ers.Entity) AS EmployeeCount
FROM
    Role r
    INNER JOIN EmployeeRolesForSearch ers ON ers.Role = r.ID
    INNER JOIN Employee e ON e.ID = ers.Entity
        AND e.IsInactive = 'F'
        AND e.GiveAccess = 'T'
WHERE
    r.IsInactive = 'F'
GROUP BY
    r.ID, r.Name
ORDER BY
    EmployeeCount DESC, r.Name
```

### Employees with Multiple Roles

To identify employees with multiple role assignments:

```sql
SELECT
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    e.Title,
    COUNT(ers.Role) AS RoleCount,
    STRING_AGG(r.Name, ', ') AS RoleNames
FROM
    Employee e
    INNER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    INNER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
GROUP BY
    e.ID, e.EntityID, e.LastName, e.FirstName, e.Email, e.Title
HAVING
    COUNT(ers.Role) > 1
ORDER BY
    RoleCount DESC, e.LastName, e.FirstName
```

**Note:** `STRING_AGG` may not be available in all NetSuite environments. If not supported, remove that field or run separate queries.

## Permission Analysis Queries

### Complete Employee Access Report

This comprehensive query provides full access details for security audits:

```sql
SELECT
    e.ID AS EmployeeID,
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Title,
    e.Email,
    s.EntityID AS SupervisorNumber,
    s.LastName AS SupervisorLastName,
    s.FirstName AS SupervisorFirstName,
    r.Name AS RoleName,
    rp.Name AS PermissionName,
    BUILTIN.DF(rp.PermLevel) AS PermissionLevel,
    BUILTIN.DF(e.Department) AS Department,
    BUILTIN.DF(e.Location) AS Location
FROM
    Employee e
    LEFT OUTER JOIN Employee s ON s.ID = e.Supervisor
    INNER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    INNER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
    INNER JOIN RolePermissions rp ON rp.Role = r.ID
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
ORDER BY
    e.LastName, e.FirstName, r.Name, rp.Name
```

### Employees with Specific Permission Levels

To find employees with full access permissions:

```sql
SELECT
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    r.Name AS RoleName,
    rp.Name AS PermissionName,
    BUILTIN.DF(rp.PermLevel) AS PermissionLevel
FROM
    Employee e
    INNER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    INNER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
    INNER JOIN RolePermissions rp ON rp.Role = r.ID
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
    AND rp.PermLevel = 4  -- Full access
ORDER BY
    e.LastName, e.FirstName, rp.Name
```

### Permission Summary by Employee

To get a summary of permission levels per employee:

```sql
SELECT
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    COUNT(CASE WHEN rp.PermLevel = 1 THEN 1 END) AS ViewPermissions,
    COUNT(CASE WHEN rp.PermLevel = 2 THEN 1 END) AS CreatePermissions,
    COUNT(CASE WHEN rp.PermLevel = 3 THEN 1 END) AS EditPermissions,
    COUNT(CASE WHEN rp.PermLevel = 4 THEN 1 END) AS FullPermissions,
    COUNT(rp.Name) AS TotalPermissions
FROM
    Employee e
    INNER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    INNER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
    INNER JOIN RolePermissions rp ON rp.Role = r.ID
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
GROUP BY
    e.ID, e.EntityID, e.LastName, e.FirstName, e.Email
ORDER BY
    FullPermissions DESC, TotalPermissions DESC, e.LastName
```

## Advanced Security Analysis

### High-Risk Permission Analysis

To identify employees with sensitive permissions:

```sql
SELECT
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    r.Name AS RoleName,
    rp.Name AS PermissionName,
    BUILTIN.DF(rp.PermLevel) AS PermissionLevel,
    s.LastName AS SupervisorLastName,
    s.FirstName AS SupervisorFirstName
FROM
    Employee e
    LEFT OUTER JOIN Employee s ON s.ID = e.Supervisor
    INNER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    INNER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
    INNER JOIN RolePermissions rp ON rp.Role = r.ID
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
    AND (
        rp.Name LIKE '%Admin%'
        OR rp.Name LIKE '%Finance%'
        OR rp.Name LIKE '%Payroll%'
        OR rp.PermLevel = 4
    )
ORDER BY
    rp.Name, e.LastName, e.FirstName
```

### Role Overlap Analysis

To find employees who might have conflicting or overlapping roles:

```sql
SELECT
    e1.EntityID AS Employee1,
    e1.LastName AS LastName1,
    e1.FirstName AS FirstName1,
    e2.EntityID AS Employee2,
    e2.LastName AS LastName2,
    e2.FirstName AS FirstName2,
    COUNT(*) AS SharedRoles
FROM
    Employee e1
    INNER JOIN EmployeeRolesForSearch ers1 ON ers1.Entity = e1.ID
    INNER JOIN EmployeeRolesForSearch ers2 ON ers2.Role = ers1.Role
    INNER JOIN Employee e2 ON e2.ID = ers2.Entity AND e2.ID > e1.ID
WHERE
    e1.IsInactive = 'F' AND e1.GiveAccess = 'T'
    AND e2.IsInactive = 'F' AND e2.GiveAccess = 'T'
GROUP BY
    e1.ID, e1.EntityID, e1.LastName, e1.FirstName,
    e2.ID, e2.EntityID, e2.LastName, e2.FirstName
HAVING
    COUNT(*) > 2  -- Employees sharing more than 2 roles
ORDER BY
    SharedRoles DESC, e1.LastName, e2.LastName
```

## Compliance and Audit Queries

### New Employee Access Report

To track recently granted access (useful for periodic reviews):

```sql
SELECT
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    e.DateCreated,
    e.LastModifiedDate,
    COUNT(ers.Role) AS RoleCount,
    COUNT(rp.Name) AS PermissionCount
FROM
    Employee e
    LEFT OUTER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
    LEFT OUTER JOIN Role r ON r.ID = ers.Role AND r.IsInactive = 'F'
    LEFT OUTER JOIN RolePermissions rp ON rp.Role = r.ID
WHERE
    e.IsInactive = 'F'
    AND e.GiveAccess = 'T'
    AND e.DateCreated >= BUILTIN.RELATIVE_RANGES('DAGO90', 'START')  -- Last 90 days
GROUP BY
    e.ID, e.EntityID, e.LastName, e.FirstName, e.Email, e.DateCreated, e.LastModifiedDate
ORDER BY
    e.DateCreated DESC
```

### Terminated Employee Cleanup Report

To identify employees who should have access removed:

```sql
SELECT
    e.EntityID,
    e.LastName,
    e.FirstName,
    e.Email,
    CASE WHEN e.IsInactive = 'T' THEN 'Inactive' ELSE 'Active' END AS EmployeeStatus,
    CASE WHEN e.GiveAccess = 'T' THEN 'Has Access' ELSE 'No Access' END AS AccessStatus,
    e.LastModifiedDate,
    COUNT(ers.Role) AS AssignedRoles
FROM
    Employee e
    LEFT OUTER JOIN EmployeeRolesForSearch ers ON ers.Entity = e.ID
WHERE
    (e.IsInactive = 'T' AND e.GiveAccess = 'T')  -- Inactive but still has access
    OR (e.IsInactive = 'F' AND e.GiveAccess = 'F')  -- Active but no access
GROUP BY
    e.ID, e.EntityID, e.LastName, e.FirstName, e.Email,
    e.IsInactive, e.GiveAccess, e.LastModifiedDate
ORDER BY
    e.IsInactive DESC, e.LastModifiedDate DESC
```

## Best Practices for Employee Queries

### 1. Security and Access Filtering

**Always consider your security requirements:**

- Use `GiveAccess = 'T'` to focus on users with NetSuite access
- Include `IsInactive = 'F'` unless auditing requires all employees
- For compliance audits, you may need to include inactive employees and roles

### 2. JOIN Strategy

**Use appropriate JOIN types:**

- `LEFT OUTER JOIN` for supervisors (not all employees have supervisors)
- `INNER JOIN` for roles (only show employees with role assignments)
- `LEFT OUTER JOIN` for roles if you want to include employees without roles

### 3. Performance Considerations

**Optimize for large datasets:**

- Filter by `IsInactive` early in your WHERE clause
- Use indexed fields like `ID` and `EntityID` in JOIN conditions
- Consider using `WHERE RowNum <= limit` for large result sets
- Add date filters when possible to reduce dataset size

### 4. Data Interpretation

**Understanding the results:**

- Permission levels are numeric - always use `BUILTIN.DF()` for readable values
- Multiple rows per employee are normal when they have multiple roles/permissions
- Empty supervisor fields indicate top-level employees
- Role names and permission names can be customized in each NetSuite instance

### 5. Audit Trail Considerations

**For compliance reporting:**

- Include `DateCreated` and `LastModifiedDate` for audit trails
- Consider tracking when access was granted vs. when employee was created
- Document the purpose and scope of each query for audit documentation

## Common Use Cases

### Security Audits

- **Employee access reviews** - Who has access and what level
- **Role certification** - Validate role assignments are appropriate
- **Segregation of duties** - Identify potential conflicts
- **Privileged access** - Monitor high-level permissions

### Organizational Analysis

- **Reporting structures** - Employee-supervisor relationships
- **Role distribution** - How roles are spread across the organization
- **Department analysis** - Access patterns by organizational unit
- **Location analysis** - Geographic distribution of access

### Compliance Reporting

- **SOX compliance** - Financial system access documentation
- **Regulatory audits** - User access and permission documentation
- **Access certification** - Periodic review of user entitlements
- **Terminated employee cleanup** - Ensure proper access removal

### HR and Management

- **New hire setup** - Template for standard role assignments
- **Promotion tracking** - Changes in roles and permissions over time
- **Organizational charts** - Visual representation of reporting relationships
- **Succession planning** - Understanding role dependencies

## Notes and Tips

- **No wildcard selectors** - SuiteQL doesn't support `SELECT *` syntax
- **Case sensitivity** - Field names and values are case-sensitive
- **Date handling** - Use `TO_DATE()` function or `BUILTIN.RELATIVE_RANGES()` for date comparisons
- **Performance** - Large employee datasets may require pagination or date filtering
- **Customization** - Role names and permission names vary by NetSuite instance
- **Schema changes** - NetSuite updates may affect available fields or table structures
- **Testing** - Always test queries in a sandbox environment first
- **Documentation** - Keep query documentation for audit purposes
