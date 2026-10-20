#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

delete process.env.OPENAI_API_KEY;

const { RAGService } = await import('../../dist/services/ragService.js');
const ragService = new RAGService();

const codeSampleResult = await ragService.retrieveExpandedContextWithMode(
  'typed client action handleRestletAction REST server action pattern',
  5,
  0.3,
  'action_docs',
  2
);

assert.equal(codeSampleResult.mode, 'lexical');
assert.equal(codeSampleResult.fallbackReason, 'missing_openai_key');
assert.ok(
  codeSampleResult.results.length > 0,
  'Expected local code-sample matches without an OpenAI API key'
);
assert.ok(
  codeSampleResult.results.some(
    result => result.metadata.category === 'action_docs'
  ),
  'Expected action documentation in lexical results'
);

const suiteqlResult = await ragService.retrieveRelevantContextWithMode(
  'SuiteQL customer transaction query joins and fields',
  5,
  0.35
);

assert.equal(suiteqlResult.mode, 'lexical');
assert.ok(
  suiteqlResult.results.length > 0,
  'Expected local SuiteQL matches without an OpenAI API key'
);

const cachelessRagService = new RAGService();
cachelessRagService.vectorDbPath = join(
  tmpdir(),
  `missing-suitereact-vector-cache-${process.pid}`
);
const cachelessResult = await cachelessRagService.retrieveRelevantContextWithMode(
  'SuiteReact DataGrid component patterns',
  3,
  0.3,
  'suitereact_component_library'
);

assert.equal(cachelessResult.mode, 'lexical');
assert.ok(
  cachelessResult.results.length > 0,
  'Expected lexical retrieval to load packaged resources without a vector cache'
);

process.env.OPENAI_API_KEY = 'intentional-test-key';
const failedEmbeddingRagService = new RAGService();
failedEmbeddingRagService.openai = {
  embeddings: {
    create: async () => {
      throw new Error('Intentional embedding failure');
    },
  },
};
const failedEmbeddingResult =
  await failedEmbeddingRagService.retrieveRelevantContextWithMode(
    'SuiteReact application lifecycle and build steps',
    3,
    0.3
  );
delete process.env.OPENAI_API_KEY;

assert.equal(failedEmbeddingResult.mode, 'lexical');
assert.equal(
  failedEmbeddingResult.fallbackReason,
  'embedding_request_failed'
);
assert.ok(
  failedEmbeddingResult.results.length > 0,
  'Expected lexical matches after an embedding provider failure'
);

process.env.OPENAI_API_KEY = 'intentional-test-key';
const noSemanticMatchRagService = new RAGService();
noSemanticMatchRagService.openai = {
  embeddings: {
    create: async () => ({
      data: [{ embedding: Array(1536).fill(0) }],
    }),
  },
};
const noSemanticMatchResult =
  await noSemanticMatchRagService.retrieveRelevantContextWithMode(
    'SuiteReact performance and pagination patterns',
    3,
    0.3
  );
delete process.env.OPENAI_API_KEY;

assert.equal(noSemanticMatchResult.mode, 'lexical');
assert.equal(
  noSemanticMatchResult.fallbackReason,
  'no_semantic_matches'
);
assert.ok(
  noSemanticMatchResult.results.length > 0,
  'Expected lexical matches when semantic retrieval returns no usable matches'
);

const vectorCache = JSON.parse(
  await readFile(
    new URL('../../.vectordb/embeddings.json', import.meta.url),
    'utf8'
  )
);
process.env.OPENAI_API_KEY = 'intentional-test-key';
const semanticRagService = new RAGService();
semanticRagService.openai = {
  embeddings: {
    create: async () => ({
      data: [{ embedding: vectorCache[0].embedding }],
    }),
  },
};
const semanticResult = await semanticRagService.retrieveRelevantContextWithMode(
  'semantic primary path verification',
  3,
  0.3
);
delete process.env.OPENAI_API_KEY;

assert.equal(semanticResult.mode, 'semantic');
assert.ok(
  semanticResult.results.length > 0,
  'Expected semantic retrieval to remain primary when embeddings are available'
);

console.log(
  `Hybrid retrieval passed: semantic primary plus ${codeSampleResult.results.length} code-sample and ${suiteqlResult.results.length} SuiteQL fallback matches; all degraded paths verified`
);
