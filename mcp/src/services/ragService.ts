import { promises as fs } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

interface OpenAIEmbeddingClient {
  embeddings: {
    create(input: {
      model: string;
      input: string;
    }): Promise<{ data: Array<{ embedding: number[] }> }>;
  };
}

type OpenAIConstructor = new (input: {
  apiKey: string;
}) => OpenAIEmbeddingClient;

interface VectorEmbedding {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    category: string;
    source: string;
    type: string;
  };
}

export interface RAGResult {
  content: string;
  score: number;
  metadata: {
    category: string;
    source: string;
    type: string;
  };
}

interface ExpandedRAGResult extends RAGResult {
  chunkId?: string;
}

export type RetrievalMode = 'semantic' | 'lexical';

export type RetrievalFallbackReason =
  'missing_openai_key' | 'embedding_request_failed' | 'no_semantic_matches';

export interface RAGRetrievalOutcome {
  results: RAGResult[];
  mode: RetrievalMode;
  fallbackReason?: RetrievalFallbackReason;
}

interface RankedRetrievalOutcome {
  results: ExpandedRAGResult[];
  mode: RetrievalMode;
  fallbackReason?: RetrievalFallbackReason;
}

const LEXICAL_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'use',
  'what',
  'with',
]);

export class RAGService {
  private openai: OpenAIEmbeddingClient | null = null;
  private vectorDatabase: VectorEmbedding[] = [];
  private lexicalDatabase: VectorEmbedding[] = [];
  private initialized = false;
  private vectorDbPath: string;

  constructor() {
    this.vectorDbPath = join(__dirname, '../..', '.vectordb');
  }

  private getOpenAI(): OpenAIEmbeddingClient {
    if (!this.openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          'OPENAI_API_KEY environment variable is required for generating embeddings'
        );
      }
      const OpenAI = require('openai').default as OpenAIConstructor;
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.openai;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.error('🔄 Initializing RAG Service...');

    try {
      // Try to load existing vector database
      await this.loadVectorDatabase();
      console.error(
        `✅ Loaded ${this.vectorDatabase.length} embeddings from cache`
      );
    } catch {
      if (process.env.OPENAI_API_KEY) {
        console.error(
          '📄 No existing vector database found, creating new one...'
        );
        try {
          await this.buildVectorDatabase();
        } catch (buildError) {
          console.warn(
            '⚠️ Semantic index build failed; loading local lexical corpus instead:',
            buildError instanceof Error ? buildError.message : buildError
          );
        }
      } else {
        console.error(
          '📄 No vector cache or OpenAI key found; loading local lexical corpus...'
        );
      }
    }

    await this.loadLexicalCorpus();

    this.initialized = true;
    console.error('🚀 RAG Service initialized successfully');
  }

  private async loadVectorDatabase(): Promise<void> {
    const dbPath = join(this.vectorDbPath, 'embeddings.json');
    const data = await fs.readFile(dbPath, 'utf8');
    this.vectorDatabase = JSON.parse(data);
  }

  private async saveVectorDatabase(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.vectorDbPath, { recursive: true });

    const dbPath = join(this.vectorDbPath, 'embeddings.json');
    await fs.writeFile(dbPath, JSON.stringify(this.vectorDatabase, null, 2));
  }

  private async loadLexicalCorpus(): Promise<void> {
    const resourcesPath = join(__dirname, '../resources');
    const documents = await this.loadDocuments(resourcesPath);

    this.lexicalDatabase = documents.flatMap(doc =>
      this.chunkDocument(doc.content, 1000, 200).map((content, index) => ({
        id: `${doc.id}_chunk_${index}`,
        content,
        embedding: [],
        metadata: {
          category: doc.category,
          source: doc.source,
          type: doc.type,
        },
      }))
    );

    console.error(
      `✅ Loaded ${this.lexicalDatabase.length} current resource chunks for lexical retrieval`
    );
  }

  private async buildVectorDatabase(): Promise<void> {
    console.error('🧠 Building vector database with embeddings...');

    const resourcesPath = join(__dirname, '../resources');
    const documents = await this.loadDocuments(resourcesPath);

    console.error(`📚 Processing ${documents.length} documents...`);

    for (const doc of documents) {
      const chunks = this.chunkDocument(doc.content, 1000, 200); // 1000 chars with 200 char overlap

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${doc.id}_chunk_${i}`;
        console.error(
          `🔄 Processing chunk ${i + 1}/${chunks.length} of ${doc.source}`
        );

        const embedding = await this.generateEmbedding(chunks[i]);

        this.vectorDatabase.push({
          id: chunkId,
          content: chunks[i],
          embedding,
          metadata: {
            category: doc.category,
            source: doc.source,
            type: doc.type,
          },
        });
      }
    }

    await this.saveVectorDatabase();
    console.error(
      `✅ Built vector database with ${this.vectorDatabase.length} embeddings`
    );
  }

  private async loadDocuments(resourcesPath: string): Promise<
    Array<{
      id: string;
      content: string;
      category: string;
      source: string;
      type: string;
    }>
  > {
    const documents = [];
    const files = await fs.readdir(resourcesPath);

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = join(resourcesPath, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Categorize based on filename
        let category = 'general';
        let type = 'documentation';

        if (file.includes('suiteql_customers')) {
          category = 'suiteql_customers';
        } else if (file.includes('suiteql_employees')) {
          category = 'suiteql_employees';
        } else if (file.includes('suiteql_transactions')) {
          category = 'suiteql_transactions';
        } else if (file.includes('suitereact_app_build_steps')) {
          category = 'app_build_steps';
          type = 'framework';
        } else if (file.includes('suitereact_app_lifecycle')) {
          category = 'app_lifecycle';
          type = 'framework';
        } else if (file.includes('suitereact_performance')) {
          category = 'app_performance';
          type = 'framework';
        } else if (file.includes('suitereact_app_quality')) {
          category = 'app_quality';
          type = 'framework';
        } else if (file.includes('suitereact')) {
          category = 'suitereact';
          type = 'framework';
        }

        documents.push({
          id: file.replace('.md', ''),
          content,
          category,
          source: file,
          type,
        });
      } else if (file.endsWith('.json')) {
        const filePath = join(resourcesPath, file);
        const content = await fs.readFile(filePath, 'utf8');

        let category = 'general';
        let type = 'configuration';

        if (file.includes('suitereact_code_samples')) {
          category = 'suitereact_code_samples';
          type = 'examples';
        } else if (file.includes('suitereact_component_library')) {
          category = 'suitereact_component_library';
          type = 'components';
        } else if (file.includes('suitereact_action_docs')) {
          category = 'action_docs';
          type = 'documentation';
        } else if (file.includes('code_samples')) {
          category = 'code_samples';
          type = 'examples';
        } else if (file.includes('component_library')) {
          category = 'component_library';
          type = 'components';
        }

        documents.push({
          id: file.replace('.json', ''),
          content,
          category,
          source: file,
          type,
        });
      }
    }

    return documents;
  }

  private chunkDocument(
    content: string,
    chunkSize: number,
    overlap: number
  ): string[] {
    const chunks = [];
    let start = 0;

    while (start < content.length) {
      let end = Math.min(start + chunkSize, content.length);

      // If this isn't the last chunk, try to end at a good boundary
      if (end < content.length) {
        // First try to find a paragraph break (double newline)
        const paragraphBreak = content.lastIndexOf('\n\n', end);
        if (paragraphBreak > start + chunkSize * 0.5) {
          end = paragraphBreak + 2; // Include the paragraph break
        } else {
          // Otherwise try to find a line break
          const lineBreak = content.lastIndexOf('\n', end);
          if (lineBreak > start + chunkSize * 0.5) {
            end = lineBreak + 1; // Include the line break
          } else {
            // Last resort: find a word boundary
            const wordBoundary = content.lastIndexOf(' ', end);
            if (wordBoundary > start + chunkSize * 0.3) {
              end = wordBoundary + 1; // Include the space
            }
            // If no good boundary found, keep the original end
          }
        }
      }

      const chunk = content.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      if (end >= content.length) break;

      // Calculate next start position with overlap, but respect boundaries
      let nextStart = end - overlap;

      // Try to start at a good boundary for the next chunk
      const nextLineStart = content.indexOf('\n', nextStart);
      if (nextLineStart !== -1 && nextLineStart < nextStart + overlap * 0.5) {
        nextStart = nextLineStart + 1;
      } else {
        const nextWordStart = content.indexOf(' ', nextStart);
        if (nextWordStart !== -1 && nextWordStart < nextStart + overlap * 0.5) {
          nextStart = nextWordStart + 1;
        }
      }

      start = Math.max(nextStart, start + 1); // Ensure progress
    }

    return chunks;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const openai = this.getOpenAI();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  }

  async retrieveRelevantContext(
    query: string,
    limit: number = 5,
    threshold: number = 0.7,
    categoryFilter?: string
  ): Promise<RAGResult[]> {
    const outcome = await this.retrieveRelevantContextWithMode(
      query,
      limit,
      threshold,
      categoryFilter
    );
    return outcome.results;
  }

  async retrieveRelevantContextWithMode(
    query: string,
    limit: number = 5,
    threshold: number = 0.7,
    categoryFilter?: string
  ): Promise<RAGRetrievalOutcome> {
    const outcome = await this.retrieveRankedContext(
      query,
      threshold,
      categoryFilter
    );

    return {
      ...outcome,
      results: outcome.results.slice(0, limit).map(this.toRAGResult),
    };
  }

  async retrieveExpandedContext(
    query: string,
    limit: number = 5,
    threshold: number = 0.7,
    categoryFilter?: string,
    expandChunks: number = 2
  ): Promise<RAGResult[]> {
    const outcome = await this.retrieveExpandedContextWithMode(
      query,
      limit,
      threshold,
      categoryFilter,
      expandChunks
    );
    return outcome.results;
  }

  async retrieveExpandedContextWithMode(
    query: string,
    limit: number = 5,
    threshold: number = 0.7,
    categoryFilter?: string,
    expandChunks: number = 2
  ): Promise<RAGRetrievalOutcome> {
    const outcome = await this.retrieveRankedContext(
      query,
      threshold,
      categoryFilter
    );

    const resultsBySource = new Map<string, ExpandedRAGResult[]>();
    for (const result of outcome.results) {
      const sourceKey = `${result.metadata.source}_${result.metadata.category}`;
      if (!resultsBySource.has(sourceKey)) {
        resultsBySource.set(sourceKey, []);
      }
      resultsBySource.get(sourceKey)!.push(result);
    }

    const expandedResults: RAGResult[] = [];
    for (const chunks of resultsBySource.values()) {
      chunks.sort((a, b) => b.score - a.score);

      for (const chunk of chunks.slice(
        0,
        Math.ceil(limit / resultsBySource.size)
      )) {
        expandedResults.push({
          content: this.expandChunkContext(
            chunk.chunkId!,
            expandChunks,
            outcome.mode === 'lexical'
              ? this.lexicalDatabase
              : this.vectorDatabase
          ),
          score: chunk.score,
          metadata: chunk.metadata,
        });
      }
    }

    return {
      mode: outcome.mode,
      fallbackReason: outcome.fallbackReason,
      results: expandedResults
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
    };
  }

  private async retrieveRankedContext(
    query: string,
    threshold: number,
    categoryFilter?: string
  ): Promise<RankedRetrievalOutcome> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        mode: 'lexical',
        fallbackReason: 'missing_openai_key',
        results: this.rankLexically(query, threshold, categoryFilter),
      };
    }

    try {
      const semanticResults = await this.rankSemantically(
        query,
        threshold,
        categoryFilter
      );
      if (semanticResults.length > 0) {
        return { mode: 'semantic', results: semanticResults };
      }

      return {
        mode: 'lexical',
        fallbackReason: 'no_semantic_matches',
        results: this.rankLexically(query, threshold, categoryFilter),
      };
    } catch (error) {
      console.warn(
        '⚠️ Semantic retrieval failed; using local lexical fallback:',
        error instanceof Error ? error.message : error
      );
      return {
        mode: 'lexical',
        fallbackReason: 'embedding_request_failed',
        results: this.rankLexically(query, threshold, categoryFilter),
      };
    }
  }

  private async rankSemantically(
    query: string,
    threshold: number,
    categoryFilter?: string
  ): Promise<ExpandedRAGResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const results: ExpandedRAGResult[] = [];

    for (const item of this.vectorDatabase) {
      if (categoryFilter && item.metadata.category !== categoryFilter) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
      if (!Number.isFinite(similarity) || similarity < threshold) continue;

      results.push({
        content: item.content,
        score: similarity,
        metadata: item.metadata,
        chunkId: item.id,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private rankLexically(
    query: string,
    semanticThreshold: number,
    categoryFilter?: string
  ): ExpandedRAGResult[] {
    const queryTokens = this.tokenize(query);
    const candidates = this.lexicalDatabase.filter(
      item => !categoryFilter || item.metadata.category === categoryFilter
    );

    if (queryTokens.length === 0 || candidates.length === 0) return [];

    const documentTokens = candidates.map(item => this.tokenize(item.content));
    const averageLength =
      documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) /
      documentTokens.length;
    const documentFrequency = new Map<string, number>();

    for (const tokens of documentTokens) {
      for (const token of new Set(tokens)) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
    }

    const queryFrequency = new Map<string, number>();
    for (const token of queryTokens) {
      queryFrequency.set(token, (queryFrequency.get(token) ?? 0) + 1);
    }

    const k1 = 1.5;
    const b = 0.75;
    const scored = candidates.map((item, index) => {
      const tokens = documentTokens[index];
      const termFrequency = new Map<string, number>();
      for (const token of tokens) {
        termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
      }

      let score = 0;
      for (const [term, queryWeight] of queryFrequency.entries()) {
        const frequency = termFrequency.get(term) ?? 0;
        if (frequency === 0) continue;

        const matchingDocuments = documentFrequency.get(term) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 +
            (candidates.length - matchingDocuments + 0.5) /
              (matchingDocuments + 0.5)
        );
        const lengthNormalization =
          frequency +
          k1 * (1 - b + b * (tokens.length / Math.max(averageLength, 1)));
        score +=
          inverseDocumentFrequency *
          ((frequency * (k1 + 1)) / lengthNormalization) *
          queryWeight;
      }

      return { item, score };
    });

    const maxScore = Math.max(...scored.map(result => result.score), 0);
    if (maxScore === 0) return [];

    const lexicalThreshold = Math.min(
      0.2,
      Math.max(0.05, semanticThreshold / 2)
    );

    return scored
      .map(({ item, score }) => ({
        content: item.content,
        score: score / maxScore,
        metadata: item.metadata,
        chunkId: item.id,
      }))
      .filter(result => result.score >= lexicalThreshold)
      .sort((a, b) => b.score - a.score);
  }

  private tokenize(text: string): string[] {
    const expandedCamelCase = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return (expandedCamelCase.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter(
      token => token.length > 1 && !LEXICAL_STOP_WORDS.has(token)
    );
  }

  private toRAGResult(result: ExpandedRAGResult): RAGResult {
    return {
      content: result.content,
      score: result.score,
      metadata: result.metadata,
    };
  }

  private expandChunkContext(
    chunkId: string,
    expandCount: number,
    database: VectorEmbedding[] = this.vectorDatabase
  ): string {
    // Parse chunk ID to get base info
    const parts = chunkId.split('_chunk_');
    if (parts.length !== 2) return '';

    const baseId = parts[0];
    const chunkIndex = parseInt(parts[1]);

    // Find all chunks from the same document
    const relatedChunks = database
      .filter(item => item.id.startsWith(baseId + '_chunk_'))
      .sort((a, b) => {
        const aIndex = parseInt(a.id.split('_chunk_')[1]);
        const bIndex = parseInt(b.id.split('_chunk_')[1]);
        return aIndex - bIndex;
      });

    // Determine the range of chunks to include
    const startIndex = Math.max(0, chunkIndex - Math.floor(expandCount / 2));
    const endIndex = Math.min(
      relatedChunks.length - 1,
      chunkIndex + Math.floor(expandCount / 2)
    );

    // Get the actual chunk objects in the range
    const chunksToInclude = relatedChunks.filter(chunk => {
      const index = parseInt(chunk.id.split('_chunk_')[1]);
      return index >= startIndex && index <= endIndex;
    });

    // Combine the content
    return chunksToInclude.map(chunk => chunk.content).join('\n\n');
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async rebuildDatabase(): Promise<void> {
    console.error('🔄 Rebuilding vector database...');

    // Clear existing database
    this.vectorDatabase = [];

    // Remove existing cache
    try {
      await fs.rm(this.vectorDbPath, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }

    // Rebuild
    await this.buildVectorDatabase();
    console.error('✅ Vector database rebuilt successfully');
  }
}

// Export singleton instance
export const ragService = new RAGService();
