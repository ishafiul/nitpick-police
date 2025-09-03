import { VectorStore, VectorDocument, SearchResult } from './vector-store';
import { CommitIndexType } from '../models/state';
import logger from '../utils/logger';

export interface CommitSummaryDocument extends VectorDocument {
  payload: {
    commit_sha: string;
    summary: string;
    author: string;
    author_email: string;
    commit_date: string;
    files_changed: string[];
    lines_added: number;
    lines_deleted: number;
    message: string;
    branch: string;
    tags?: string[];
    metadata?: Record<string, any>;
  };
}

export interface CodeChunkDocument extends VectorDocument {
  payload: {
    file_path: string;
    chunk_id: string;
    content: string;
    language: string;
    start_line: number;
    end_line: number;
    commit_sha: string;
    chunk_type: 'function' | 'class' | 'method' | 'block' | 'file';
    complexity_score?: number;
    dependencies?: string[];
    metadata?: Record<string, any>;
  };
}

export interface CommitSearchResult extends SearchResult {
  payload: CommitSummaryDocument['payload'];
}

export interface CodeChunkSearchResult extends SearchResult {
  payload: CodeChunkDocument['payload'];
}

export class CodeVectorStore extends VectorStore {
  private readonly COMMIT_SUMMARIES_COLLECTION = 'commit_summaries';
  private readonly CODE_CHUNKS_COLLECTION = 'code_chunks';
  private readonly COMMIT_DIMENSION = 4096;
  private readonly CODE_CHUNK_DIMENSION = 4096;

  constructor(url?: string, apiKey?: string, timeout?: number) {
    super(url, apiKey, timeout);

  }

  private async initializeCollections(): Promise<void> {
    try {

      await this.createCollection(
        this.COMMIT_SUMMARIES_COLLECTION,
        this.COMMIT_DIMENSION,
        'Cosine'
      );

      await this.createCollection(
        this.CODE_CHUNKS_COLLECTION,
        this.CODE_CHUNK_DIMENSION,
        'Cosine'
      );

      logger.info('Initialized code review collections', {
        commit_summaries: this.COMMIT_SUMMARIES_COLLECTION,
        code_chunks: this.CODE_CHUNKS_COLLECTION,
      });
    } catch (error) {
      logger.error('Failed to initialize collections', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async indexCommitSummary(
    commitIndex: CommitIndexType,
    embedding?: number[]
  ): Promise<void> {
    try {

      await this.initializeCollections();

      let commitEmbedding: number[];
      if (embedding) {
        commitEmbedding = embedding;
      } else {

        const commitText = commitIndex.summary;
        commitEmbedding = await this.generateEmbedding(commitText);
      }

      const document: CommitSummaryDocument = {
        id: commitIndex.sha,
        payload: {
          commit_sha: commitIndex.sha,
          summary: commitIndex.summary,
          author: 'Unknown',
          author_email: '',
          commit_date: commitIndex.indexed_at?.toISOString() || new Date().toISOString(),
          files_changed: [],
          lines_added: 0,
          lines_deleted: 0,
          message: commitIndex.summary,
          branch: 'main',
          tags: [],
          metadata: {},
        },
        vector: commitEmbedding,
      };

      await this.upsertDocuments(this.COMMIT_SUMMARIES_COLLECTION, [document]);
      
      logger.info('Indexed commit summary', {
        commit_sha: commitIndex.sha,
        collection: this.COMMIT_SUMMARIES_COLLECTION,
      });
    } catch (error) {
      throw new Error(`Failed to index commit summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async indexCodeChunks(
    chunks: Array<{
      chunkId: string;
      filePath: string;
      content: string;
      language: string;
      startLine: number;
      endLine: number;
      commitSha: string;
      chunkType: 'function' | 'class' | 'method' | 'block' | 'file';
      complexityScore?: number;
      dependencies?: string[];
      metadata?: Record<string, any>;
    }>,
    embeddings?: number[][]
  ): Promise<void> {
    try {

      await this.initializeCollections();
      
      const documents: CodeChunkDocument[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        let chunkEmbedding: number[];
        if (embeddings && embeddings[i]) {
          const embedding = embeddings[i];
          if (embedding) {
            chunkEmbedding = embedding;
          } else {
            chunkEmbedding = await this.generateEmbedding(chunk.content);
          }
        } else {
          chunkEmbedding = await this.generateEmbedding(chunk.content);
        }

        const document: CodeChunkDocument = {
          id: chunk.chunkId,
          payload: {
            file_path: chunk.filePath,
            chunk_id: chunk.chunkId,
            content: chunk.content,
            language: chunk.language,
            start_line: chunk.startLine,
            end_line: chunk.endLine,
            commit_sha: chunk.commitSha,
            chunk_type: chunk.chunkType,
            ...(chunk.complexityScore !== undefined && { complexity_score: chunk.complexityScore }),
            ...(chunk.dependencies !== undefined && { dependencies: chunk.dependencies }),
            ...(chunk.metadata !== undefined && { metadata: chunk.metadata }),
          },
          vector: chunkEmbedding,
        };

        documents.push(document);
      }

      await this.upsertDocuments(this.CODE_CHUNKS_COLLECTION, documents);
      
      logger.info('Indexed code chunks', {
        count: chunks.length,
        collection: this.CODE_CHUNKS_COLLECTION,
      });
    } catch (error) {
      throw new Error(`Failed to index code chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchSimilarCommits(
    query: string,
    limit: number = 10,
    scoreThreshold: number = 0.7
  ): Promise<CommitSearchResult[]> {
    try {

      await this.initializeCollections();
      
      const queryEmbedding = await this.generateEmbedding(query);
      
      const results = await this.search(
        this.COMMIT_SUMMARIES_COLLECTION,
        queryEmbedding,
        limit,
        scoreThreshold,
        true,
        false
      );

      return results as CommitSearchResult[];
    } catch (error) {
      throw new Error(`Failed to search similar commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchSimilarCodeChunks(
    query: string,
    limit: number = 10,
    scoreThreshold: number = 0.7,
    _filePath?: string,
    language?: string
  ): Promise<CodeChunkSearchResult[]> {
    try {

      await this.initializeCollections();
      
      const queryEmbedding = await this.generateEmbedding(query);

      let filter: Record<string, any> | undefined;
      if (_filePath || language) {
        filter = {
          must: [] as any[],
        };
        
        if (_filePath) {
          filter['must'].push({
            key: 'file_path',
            match: { value: _filePath },
          });
        }
        
        if (language) {
          filter['must'].push({
            key: 'language',
            match: { value: language },
          });
        }
      }

      const results = await this.search(
        this.CODE_CHUNKS_COLLECTION,
        queryEmbedding,
        limit,
        scoreThreshold,
        true,
        false
      );

      return results as CodeChunkSearchResult[];
    } catch (error) {
      throw new Error(`Failed to search similar code chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findRelatedCommits(
    codeContent: string,
    _filePath?: string,
    limit: number = 5
  ): Promise<CommitSearchResult[]> {
    try {

      await this.initializeCollections();

      const codeChunks = await this.searchSimilarCodeChunks(
        codeContent,
        limit * 2,
        0.6
      );

      const commitShas = [...new Set(codeChunks.map(chunk => chunk.payload.commit_sha))];

      const commitSummaries: CommitSearchResult[] = [];
      
      for (const sha of commitShas.slice(0, limit)) {
        const commit = await this.getDocument(this.COMMIT_SUMMARIES_COLLECTION, sha);
        if (commit) {
          commitSummaries.push({
            id: commit.id,
            score: 1.0,
            payload: commit.payload as CommitSummaryDocument['payload'],
          });
        }
      }

      return commitSummaries;
    } catch (error) {
      throw new Error(`Failed to find related commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async batchIndexCommits(
    commits: CommitIndexType[],
    embeddings?: number[][]
  ): Promise<void> {
    try {

      await this.initializeCollections();
      
      const documents: CommitSummaryDocument[] = [];

      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        if (!commit) continue;

        let commitEmbedding: number[];
        if (embeddings && embeddings[i]) {
          const embedding = embeddings[i];
          if (embedding) {
            commitEmbedding = embedding;
          } else {
            const commitText = commit.summary;
            commitEmbedding = await this.generateEmbedding(commitText);
          }
        } else {
          const commitText = commit.summary;
          commitEmbedding = await this.generateEmbedding(commitText);
        }

        const document: CommitSummaryDocument = {
          id: commit.sha,
          payload: {
            commit_sha: commit.sha,
            summary: commit.summary,
            author: 'Unknown',
            author_email: '',
            commit_date: new Date().toISOString(),
            files_changed: [],
            lines_added: 0,
            lines_deleted: 0,
            message: commit.summary,
            branch: 'main',
            tags: [],
            metadata: {},
          },
          vector: commitEmbedding,
        };

        documents.push(document);
      }

      await this.upsertDocuments(this.COMMIT_SUMMARIES_COLLECTION, documents);
      
      logger.info('Batch indexed commits', {
        count: commits.length,
        collection: this.COMMIT_SUMMARIES_COLLECTION,
      });
    } catch (error) {
      throw new Error(`Failed to batch index commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCommitSummary(commitSha: string): Promise<CommitSummaryDocument | null> {
    try {
      const document = await this.getDocument(this.COMMIT_SUMMARIES_COLLECTION, commitSha);
      return document as CommitSummaryDocument | null;
    } catch (error) {
      logger.error('Failed to get commit summary', {
        commit_sha: commitSha,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async getCodeChunk(chunkId: string): Promise<CodeChunkDocument | null> {
    try {
      const document = await this.getDocument(this.CODE_CHUNKS_COLLECTION, chunkId);
      return document as CodeChunkDocument | null;
    } catch (error) {
      logger.error('Failed to get code chunk', {
        chunk_id: chunkId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async deleteCommitAndChunks(commitSha: string): Promise<void> {
    try {

      await this.deleteDocuments(this.COMMIT_SUMMARIES_COLLECTION, [commitSha]);

      const codeChunks = await this.searchSimilarCodeChunks(
        commitSha,
        1000,
        0.1
      );
      
      const chunkIds = codeChunks
        .filter(chunk => chunk.payload.commit_sha === commitSha)
        .map(chunk => chunk.id);
      
      if (chunkIds.length > 0) {
        await this.deleteDocuments(this.CODE_CHUNKS_COLLECTION, chunkIds);
      }
      
      logger.info('Deleted commit and related chunks', {
        commit_sha: commitSha,
        chunks_deleted: chunkIds.length,
      });
    } catch (error) {
      throw new Error(`Failed to delete commit and chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCodeReviewStats(): Promise<{
    totalCommits: number;
    totalCodeChunks: number;
    averageCommitDimension: number;
    averageChunkDimension: number;
  }> {
    try {
      const commitStats = await this.getCollectionStats(this.COMMIT_SUMMARIES_COLLECTION);
      const chunkStats = await this.getCollectionStats(this.CODE_CHUNKS_COLLECTION);
      
      return {
        totalCommits: commitStats?.totalDocuments || 0,
        totalCodeChunks: chunkStats?.totalDocuments || 0,
        averageCommitDimension: commitStats?.averageVectorDimension || 0,
        averageChunkDimension: chunkStats?.averageVectorDimension || 0,
      };
    } catch (error) {
      logger.error('Failed to get code review stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        totalCommits: 0,
        totalCodeChunks: 0,
        averageCommitDimension: 0,
        averageChunkDimension: 0,
      };
    }
  }
}
