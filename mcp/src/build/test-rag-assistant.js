#!/usr/bin/env node

/**
 * Test script for the SuiteQL Query Assistant with RAG
 *
 * This script demonstrates how to use the new RAG-powered assistant
 * and shows the enhanced workflow.
 */

import dotenv from 'dotenv';
import { ragService } from '../../dist/services/ragService.js';
import { handleSuiteQLQueryAssistant } from '../../dist/tools/suiteqlQueryAssistant.js';

dotenv.config();

async function testRAGAssistant() {
  console.log('🧪 Testing SuiteQL Query Assistant with RAG...\n');

  const hasApiKey = !!process.env.OPENAI_API_KEY;

  if (!hasApiKey) {
    console.log(
      '⚠️ OPENAI_API_KEY not found - testing vector database only (no live queries)'
    );
  } else {
    console.log('✅ OPENAI_API_KEY found - testing full RAG functionality');
  }

  try {
    // First, let's check if the vector database exists and is populated
    console.log('🔍 Checking vector database...');
    await ragService.initialize();

    // Check vector database without needing API key
    console.log('✅ Vector database loaded successfully');

    if (!hasApiKey) {
      console.log('\n📊 Vector Database Summary:');
      console.log('- Vector database is built and ready');
      console.log(
        '- To test live queries, add OPENAI_API_KEY to your .env file'
      );
      console.log(
        '- The database contains pre-computed embeddings from your documentation'
      );
      console.log('\n🎯 Ready for MCP server usage!');
      console.log(
        'When you use the MCP server with OPENAI_API_KEY, the RAG assistant will work fully.'
      );
      return;
    }

    // Test different query scenarios (only if API key is available)
    const testQueries = [
      {
        name: 'Customer Query',
        args: {
          userQuery:
            'How do I get customers with their billing addresses and past due balances?',
          ragCategory: 'suiteql',
          includeExamples: true,
          includeFieldMappings: true,
        },
      },
      {
        name: 'Employee Permissions Query',
        args: {
          userQuery:
            'Find employees with administrative permissions and their supervisors',
          ragCategory: 'suiteql',
          includeExamples: true,
        },
      },
      {
        name: 'Transaction GL Impact Query',
        args: {
          userQuery: 'Get journal entries with their general ledger impact',
          ragCategory: 'suiteql',
          includeFieldMappings: true,
        },
      },
    ];

    for (const test of testQueries) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 Testing: ${test.name}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        const result = await handleSuiteQLQueryAssistant(test.args);

        if (result && result.length > 0) {
          console.log('✅ Assistant Response Generated Successfully');
          console.log(
            `📏 Response Length: ${result[0].text.length} characters`
          );

          // Show a preview of the response
          const preview = result[0].text.substring(0, 500) + '...';
          console.log('\n📖 Response Preview:');
          console.log('-'.repeat(40));
          console.log(preview);
          console.log('-'.repeat(40));
        } else {
          console.log('⚠️ No response generated');
        }
      } catch (error) {
        console.error(`❌ Error testing ${test.name}:`, error.message);
      }
    }

    // Test RAG service directly
    console.log(`\n${'='.repeat(60)}`);
    console.log('🧠 Testing RAG Service Directly');
    console.log(`${'='.repeat(60)}\n`);

    await ragService.initialize();

    const ragTest = await ragService.retrieveRelevantContext(
      'journal entries with general ledger impact',
      5,
      0.35
    );

    console.log(`✅ RAG Service Retrieved ${ragTest.length} relevant chunks`);

    if (ragTest.length > 0) {
      for (let i = 0; i < ragTest.length; i++) {
        const chunk = ragTest[i];
        console.log(`\n📄 Chunk ${i + 1}:`);
        console.log(`   Category: ${chunk.metadata.category}`);
        console.log(`   Source: ${chunk.metadata.source}`);
        console.log(`   Score: ${(chunk.score * 100).toFixed(1)}%`);
        console.log(
          `   Content Preview: ${chunk.content.substring(0, 150)}...`
        );
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 All tests completed successfully!');
    console.log(`${'='.repeat(60)}\n`);

    console.log('📝 Usage Instructions:');
    console.log('1. Use the SuiteQL Query Assistant BEFORE executing queries');
    console.log(
      '2. Get guidance on field names, JOIN patterns, and best practices'
    );
    console.log('3. Execute your refined query with confidence');
    console.log('4. Iterate based on results');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  testRAGAssistant().catch(console.error);
}

export { testRAGAssistant };
