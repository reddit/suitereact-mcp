#!/usr/bin/env node

/**
 * RAG Vector Database Rebuild Script
 *
 * Rebuilds the vector database with smart routing capabilities for
 * better SuiteQL query assistance and implementation guidance.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the same directory as this script
dotenv.config({ path: join(__dirname, '../../.env') });

async function main() {
  console.log('🔄 Rebuilding RAG Vector Database...');

  // Check if OpenAI API key is loaded
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in .env file');
    console.log('💡 Make sure you have a .env file in the project root with:');
    console.log('   OPENAI_API_KEY=your_api_key_here');
    process.exit(1);
  }

  console.log('✅ OpenAI API key loaded successfully');

  try {
    // Import the compiled ragService after env is loaded
    const { ragService } = await import('../../dist/services/ragService.js');

    // Clean slate
    const vectorDbPath = join(__dirname, '../..', '.vectordb');
    try {
      await fs.rm(vectorDbPath, { recursive: true, force: true });
      console.log('✅ Cleared existing database');
    } catch {
      console.log('ℹ️  Starting fresh');
    }

    // Rebuild with new resources
    console.log('🧠 Processing knowledge base...');
    await ragService.rebuildDatabase();

    // Quick validation
    const testResults = await ragService.retrieveRelevantContext(
      'SuiteQL customer query with addresses',
      5,
      0.5
    );

    console.log(
      `✅ Database rebuilt with ${testResults.length > 0 ? 'successful' : 'no'} test retrieval`
    );

    if (testResults.length > 0) {
      console.log('🎯 Test query results:');
      for (const result of testResults.slice(0, 2)) {
        console.log(
          `  • Score: ${(result.score * 100).toFixed(1)}% - Category: ${result.metadata.category}`
        );
      }
    }

    console.log('🎯 Architecture:');
    console.log('  • SuiteQL Bot: Documentation + RAG-enhanced context');
    console.log('  • Execute SuiteQL: Clean query execution with validation');
    console.log('  • Smart categorization for optimal context retrieval');

    console.log('\n🚀 Ready for enhanced SuiteQL assistance!');
  } catch (error) {
    console.error(
      '❌ Rebuild failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    // Print more details for debugging
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }

    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  main().catch(console.error);
}

export { main as rebuildVectorDatabase };
