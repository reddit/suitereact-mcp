import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { ragService } from '../services/ragService.js';

// Schema for SuiteQL Query Assistant
export const SuiteQLQueryAssistantInputSchema = z.object({
  userQuery: z.string(),
  ragCategory: z
    .enum(['suiteql_pure', 'suiteql', 'netsuite_records'])
    .default('suiteql'),
  includeExamples: z.boolean().default(true),
  includeFieldMappings: z.boolean().default(true),
});

export type SuiteQLQueryAssistantInput = z.infer<
  typeof SuiteQLQueryAssistantInputSchema
>;

/**
 * SuiteQL Query Assistant - Provides context and guidance before executing queries
 */
export async function handleSuiteQLQueryAssistant(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  try {
    // Validate input
    const inputArgs = SuiteQLQueryAssistantInputSchema.parse(arguments_);

    // Initialize RAG service if needed
    await ragService.initialize();

    // Determine search category based on RAG category
    let searchCategory = '';
    let searchQuery = inputArgs.userQuery;

    switch (inputArgs.ragCategory) {
      case 'suiteql_pure':
        searchCategory = 'suiteql';
        break;
      case 'suiteql':
        // Let it search across all suiteql categories
        break;
      case 'netsuite_records':
        // Focus on record structure and field information
        searchQuery = `${inputArgs.userQuery} table fields records structure`;
        break;
    }

    // Retrieve relevant context from RAG
    const retrieval = await ragService.retrieveRelevantContextWithMode(
      searchQuery,
      8, // Result count
      0.35, // Threshold for relevance
      searchCategory || undefined
    );
    const relevantContext = retrieval.results;

    // Build response
    let response = `# SuiteQL Query Assistant\n\n`;
    response += `**Your Query:** ${inputArgs.userQuery}\n\n`;
    response += `**Guidance Category:** ${inputArgs.ragCategory}\n\n`;
    response += `**Retrieval Mode:** ${
      retrieval.mode === 'semantic'
        ? 'Semantic (OpenAI embeddings)'
        : 'Lexical fallback (local, no API key required)'
    }\n\n`;

    if (retrieval.mode === 'lexical') {
      response += `> Semantic retrieval was unavailable or returned no matches. Results were ranked locally from the packaged SuiteQL resources.\n\n`;
    }

    if (relevantContext.length === 0) {
      response += `⚠️ **No specific guidance found for your query.**\n\n`;
      response += `## General SuiteQL Best Practices:\n\n`;
      response += `- Always use proper table and field names (case-sensitive)\n`;
      response += `- Use BUILTIN.DF() for human-readable values from internal IDs\n`;
      response += `- Filter by IsInactive = 'F' for active records\n`;
      response += `- Use appropriate JOIN types (INNER, LEFT OUTER)\n`;
      response += `- Never use LIMIT clauses - use the rowLimit parameter instead\n`;
      response += `- Use TO_DATE() for date comparisons\n`;
      response += `- Always test queries in a development environment first\n\n`;
    } else {
      response += `## 📚 Relevant Documentation\n\n`;

      // Group results by category for better organization
      const groupedResults = relevantContext.reduce(
        (acc, result) => {
          const category = result.metadata.category;
          if (!acc[category]) acc[category] = [];
          acc[category].push(result);
          return acc;
        },
        {} as Record<string, typeof relevantContext>
      );

      for (const [category, results] of Object.entries(groupedResults)) {
        response += `### ${category.replace('_', ' ').toUpperCase()}\n\n`;

        for (const result of results.slice(0, 3)) {
          // Limit per category
          response += `**Relevance Score:** ${(result.score * 100).toFixed(1)}%\n\n`;
          response += `${result.content}\n\n`;
          response += `---\n\n`;
        }
      }
    }

    // Add field mapping guidance if requested
    if (inputArgs.includeFieldMappings) {
      response += `## 🗺️ Field Mapping Guidelines\n\n`;
      response += `### Common Field Names:\n`;
      response += `- **ID** - Internal record ID (use for JOINs)\n`;
      response += `- **EntityID** - Human-readable identifier\n`;
      response += `- **IsInactive** - F = active, T = inactive\n`;
      response += `- **DateCreated** - Record creation timestamp\n`;
      response += `- **LastModifiedDate** - Last modification timestamp\n\n`;

      response += `### Using BUILTIN.DF():\n`;
      response += `Always use BUILTIN.DF() to convert internal IDs to readable names:\n`;
      response += `- \`BUILTIN.DF(Customer.SalesRep)\` instead of just \`Customer.SalesRep\`\n`;
      response += `- \`BUILTIN.DF(Transaction.Type)\` for transaction type names\n`;
      response += `- \`BUILTIN.DF(Employee.Department)\` for department names\n\n`;
    }

    // Add example patterns if requested
    if (inputArgs.includeExamples) {
      response += `## 🔍 Query Pattern Examples\n\n`;
      response += `### Basic SELECT with filtering:\n`;
      response += `\`\`\`sql\n`;
      response += `SELECT\n`;
      response += `    Customer.EntityID,\n`;
      response += `    Customer.CompanyName,\n`;
      response += `    BUILTIN.DF(Customer.SalesRep) AS SalesRep\n`;
      response += `FROM\n`;
      response += `    Customer\n`;
      response += `WHERE\n`;
      response += `    Customer.IsInactive = 'F'\n`;
      response += `ORDER BY\n`;
      response += `    Customer.EntityID\n`;
      response += `\`\`\`\n\n`;

      response += `### JOIN with related tables:\n`;
      response += `\`\`\`sql\n`;
      response += `SELECT\n`;
      response += `    t.TranID,\n`;
      response += `    BUILTIN.DF(t.Entity) AS CustomerName,\n`;
      response += `    t.ForeignTotal\n`;
      response += `FROM\n`;
      response += `    Transaction t\n`;
      response += `    INNER JOIN TransactionLine tl ON tl.Transaction = t.ID\n`;
      response += `WHERE\n`;
      response += `    t.Type = 'CustInvc'\n`;
      response += `    AND t.IsInactive = 'F'\n`;
      response += `\`\`\`\n\n`;
    }

    // Add important reminders
    response += `## ⚠️ Important Reminders\n\n`;
    response += `1. **NEVER use LIMIT clauses** - Use the \`rowLimit\` parameter instead\n`;
    response += `2. **Always test queries** before using in production\n`;
    response += `3. **Use proper field names** - Check NetSuite's Schema Browser\n`;
    response += `4. **Filter inactive records** unless specifically needed\n`;
    response += `5. **Use appropriate JOIN types** based on your data needs\n\n`;

    response += `## 🚀 Next Steps\n\n`;
    response += `1. Use this guidance to craft your SuiteQL query\n`;
    response += `2. Test your query using the Execute SuiteQL Query tool\n`;
    response += `3. Refine based on results and any error messages\n`;
    response += `4. Implement the validated query in your application\n\n`;

    response += `---\n\n`;
    response += `*💡 This guidance used ${retrieval.mode} retrieval with ${relevantContext.length} relevant document chunks.*`;

    return [{ type: 'text', text: response }];
  } catch (error) {
    console.error('Error in SuiteQL Query Assistant:', error);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    const errorResponse = {
      error: 'SuiteQL Query Assistant Error',
      details: errorMessage,
      timestamp: new Date().toISOString(),
    };

    return [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }];
  }
}
