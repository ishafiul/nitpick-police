import { QdrantClient } from '@qdrant/js-client-rest';
import logger from '../utils/logger';
import { OllamaService } from './ollama-service';

// TypeScript interfaces for vector operations
export interface VectorDocument {
  id: string;
  payload: Record<string, any>;
  vector: number[];
  score?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
  vector?: number[] | undefined;
}

export interface CollectionInfo {
  name: string;
  vectors_count: number;
  points_count: number;
  status: 'ok' | 'error';
  config: {
    params: {
      vectors: {
        size: number;
        distance: 'Cosine' | 'Euclid' | 'Dot';
      };
    };
  };
}

export interface SearchParams {
  query_vector: number[];
  limit: number;
  score_threshold?: number | null;
  with_payload?: boolean;
  with_vector?: boolean;
  filter?: Record<string, any>;
}

export interface BatchOperation {
  operation: 'upsert' | 'delete';
  documents: VectorDocument[];
}

// Fallback storage interface for when Qdrant is unavailable
export interface FallbackStorage {
  documents: VectorDocument[];
  collections: Record<string, CollectionInfo>;
}

export class VectorStore {
  private client: QdrantClient;
  private ollamaService: OllamaService;
  private fallbackStorage: Map<string, FallbackStorage>;
  private isQdrantAvailable: boolean = true;
  private readonly defaultDimension = 4096;
  private readonly defaultDistance = 'Cosine';

  constructor(
    private url: string = 'http://localhost:6333',
    private apiKey?: string,
    private timeout: number = 30000
  ) {
    const clientConfig: any = {
      url: this.url,
      timeout: this.timeout,
    };
    
    if (this.apiKey) {
      clientConfig.apiKey = this.apiKey;
    }
    
    this.client = new QdrantClient(clientConfig);
    
    this.ollamaService = new OllamaService({
      baseURL: 'http://localhost:11434',
      apiKey: 'ollama',
      timeout: this.timeout,
    });
    
    this.fallbackStorage = new Map();
    
    // Test Qdrant availability
    this.checkAvailability();
  }

  /**
   * Check if Qdrant is available and update availability status
   */
  private async checkAvailability(): Promise<void> {
    try {
      await this.client.getCollections();
      this.isQdrantAvailable = true;
      logger.info('Qdrant vector database is available', { url: this.url });
    } catch (error) {
      this.isQdrantAvailable = false;
      logger.warn('Qdrant vector database is unavailable, using fallback storage', { 
        url: this.url, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Create a collection with proper schema
   */
  async createCollection(
    name: string, 
    dimension: number = this.defaultDimension,
    distance: 'Cosine' | 'Euclid' | 'Dot' = this.defaultDistance
  ): Promise<void> {
    if (!this.isQdrantAvailable) {
      // Create fallback collection
      if (!this.fallbackStorage.has(name)) {
        this.fallbackStorage.set(name, {
          documents: [],
          collections: {
            [name]: {
              name,
              vectors_count: 0,
              points_count: 0,
              status: 'ok',
              config: {
                params: {
                  vectors: {
                    size: dimension,
                    distance,
                  },
                },
              },
            },
          },
        });
      }
      logger.info('Created fallback collection', { name, dimension, distance });
      return;
    }

    try {
      await this.client.createCollection(name, {
        vectors: {
          size: dimension,
          distance,
        },
      });
      logger.info('Created Qdrant collection', { name, dimension, distance });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.info('Collection already exists', { name });
      } else {
        throw new Error(`Failed to create collection ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<void> {
    if (!this.isQdrantAvailable) {
      this.fallbackStorage.delete(name);
      logger.info('Deleted fallback collection', { name });
      return;
    }

    try {
      await this.client.deleteCollection(name);
      logger.info('Deleted Qdrant collection', { name });
    } catch (error) {
      throw new Error(`Failed to delete collection ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get collection information
   */
  async getCollectionInfo(name: string): Promise<CollectionInfo | null> {
    if (!this.isQdrantAvailable) {
      const fallback = this.fallbackStorage.get(name);
      return fallback?.collections[name] || null;
    }

    try {
      const info = await this.client.getCollection(name);
      // Handle the complex Qdrant response type
      const vectorsConfig = (info as any).config?.params?.vectors;
      const size = typeof vectorsConfig === 'object' && vectorsConfig?.size ? vectorsConfig.size : 0;
      const distance = typeof vectorsConfig === 'object' && vectorsConfig?.distance ? 
        (vectorsConfig.distance as 'Cosine' | 'Euclid' | 'Dot') : 'Cosine';
      
      return {
        name: name,
        vectors_count: (info as any).vectors_count || 0,
        points_count: (info as any).points_count || 0,
        status: (info as any).status === 'green' ? 'ok' : 'error',
        config: {
          params: {
            vectors: {
              size,
              distance,
            },
          },
        },
      };
    } catch (error) {
      logger.error('Failed to get collection info', { name, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionInfo[]> {
    if (!this.isQdrantAvailable) {
      return Array.from(this.fallbackStorage.values()).map(storage => 
        Object.values(storage.collections)
      ).flat();
    }

    try {
      const collections = await this.client.getCollections();
      return collections.collections.map((collection: any) => {
        const vectorsConfig = collection.config?.params?.vectors;
        const size = typeof vectorsConfig === 'object' && vectorsConfig?.size ? vectorsConfig.size : 0;
        const distance = typeof vectorsConfig === 'object' && vectorsConfig?.distance ? 
          (vectorsConfig.distance as 'Cosine' | 'Euclid' | 'Dot') : 'Cosine';
        
        return {
          name: collection.name,
          vectors_count: collection.vectors_count || 0,
          points_count: collection.points_count || 0,
          status: collection.status || 'ok',
          config: {
            params: {
              vectors: {
                size,
                distance,
              },
            },
          },
        };
      });
    } catch (error) {
      logger.error('Failed to list collections', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  /**
   * Upsert documents to a collection
   */
  async upsertDocuments(collectionName: string, documents: VectorDocument[]): Promise<void> {
    if (!this.isQdrantAvailable) {
      // Store in fallback storage
      const fallback = this.fallbackStorage.get(collectionName);
      if (fallback) {
        for (const doc of documents) {
          const existingIndex = fallback.documents.findIndex(d => d.id === doc.id);
          if (existingIndex >= 0) {
            fallback.documents[existingIndex] = doc;
          } else {
            fallback.documents.push(doc);
          }
        }
        if (fallback.collections[collectionName]) {
          fallback.collections[collectionName].vectors_count = fallback.documents.length;
          fallback.collections[collectionName].points_count = fallback.documents.length;
        }
      }
      logger.info('Upserted documents to fallback storage', { collection: collectionName, count: documents.length });
      return;
    }

    try {
      const points = documents.map(doc => ({
        id: doc.id,
        vector: doc.vector,
        payload: doc.payload,
      }));

      await this.client.upsert(collectionName, {
        wait: true,
        points,
      });
      
      logger.info('Upserted documents to Qdrant', { collection: collectionName, count: documents.length });
    } catch (error) {
      throw new Error(`Failed to upsert documents to collection ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete documents from a collection
   */
  async deleteDocuments(collectionName: string, documentIds: string[]): Promise<void> {
    if (!this.isQdrantAvailable) {
      // Remove from fallback storage
      const fallback = this.fallbackStorage.get(collectionName);
      if (fallback) {
        fallback.documents = fallback.documents.filter(doc => !documentIds.includes(doc.id));
        if (fallback.collections[collectionName]) {
          fallback.collections[collectionName].vectors_count = fallback.documents.length;
          fallback.collections[collectionName].points_count = fallback.documents.length;
        }
      }
      logger.info('Deleted documents from fallback storage', { collection: collectionName, count: documentIds.length });
      return;
    }

    try {
      await this.client.delete(collectionName, {
        wait: true,
        points: documentIds,
      });
      
      logger.info('Deleted documents from Qdrant', { collection: collectionName, count: documentIds.length });
    } catch (error) {
      throw new Error(`Failed to delete documents from collection ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for similar vectors
   */
  async search(
    collectionName: string, 
    queryVector: number[], 
    limit: number = 10,
    scoreThreshold?: number,
    withPayload: boolean = true,
    withVector: boolean = false
  ): Promise<SearchResult[]> {
    if (!this.isQdrantAvailable) {
      // Search in fallback storage using cosine similarity
      const fallback = this.fallbackStorage.get(collectionName);
      if (!fallback) {
        return [];
      }

      const results: SearchResult[] = fallback.documents
        .map(doc => ({
          id: doc.id,
          score: this.cosineSimilarity(queryVector, doc.vector),
          payload: doc.payload,
          vector: withVector ? doc.vector : undefined,
        }))
        .filter(result => !scoreThreshold || result.score >= scoreThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info('Searched fallback storage', { collection: collectionName, results: results.length });
      return results;
    }

    try {
      // Use the correct Qdrant search parameters
      const searchParams = {
        vector: queryVector,
        limit,
        score_threshold: scoreThreshold || null,
        with_payload: withPayload,
        with_vector: withVector,
      };

      const response = await this.client.search(collectionName, searchParams);
      
      const results: SearchResult[] = response.map((point: any) => ({
        id: point.id as string,
        score: point.score,
        payload: point.payload || {},
        vector: withVector ? (point.vector as number[]) : undefined,
      }));

      logger.info('Searched Qdrant collection', { collection: collectionName, results: results.length });
      return results;
    } catch (error) {
      throw new Error(`Failed to search collection ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings using Ollama
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embedding = await this.ollamaService.generateEmbedding({ 
        model: 'nomic-embed-text',
        prompt: text 
      });
      return embedding.embedding;
    } catch (error) {
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch operations (upsert/delete)
   */
  async batchOperation(collectionName: string, operations: BatchOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.operation === 'upsert') {
        await this.upsertDocuments(collectionName, operation.documents);
      } else if (operation.operation === 'delete') {
        const ids = operation.documents.map(doc => doc.id);
        await this.deleteDocuments(collectionName, ids);
      }
    }
    
    logger.info('Completed batch operations', { 
      collection: collectionName, 
      operations: operations.length 
    });
  }

  /**
   * Get document by ID
   */
  async getDocument(collectionName: string, documentId: string): Promise<VectorDocument | null> {
    if (!this.isQdrantAvailable) {
      const fallback = this.fallbackStorage.get(collectionName);
      return fallback?.documents.find(doc => doc.id === documentId) || null;
    }

    try {
      const response = await this.client.retrieve(collectionName, {
        ids: [documentId],
        with_payload: true,
        with_vector: true,
      });

      if (response.length === 0) {
        return null;
      }

      const point = response[0];
      if (!point) return null;

      return {
        id: point.id as string,
        payload: point.payload || {},
        vector: point.vector as number[],
      };
    } catch (error) {
      logger.error('Failed to get document', { 
        collection: collectionName, 
        documentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName: string): Promise<{
    totalDocuments: number;
    totalVectors: number;
    averageVectorDimension: number;
  } | null> {
    if (!this.isQdrantAvailable) {
      const fallback = this.fallbackStorage.get(collectionName);
      if (!fallback) {
        return null;
      }

      const documents = fallback.documents;
      const totalDocuments = documents.length;
      const totalVectors = documents.length;
      const averageVectorDimension = documents.length > 0 && documents[0]?.vector
        ? documents[0].vector.length 
        : 0;

      return { totalDocuments, totalVectors, averageVectorDimension };
    }

    try {
      const info = await this.getCollectionInfo(collectionName);
      if (!info) {
        return null;
      }

      return {
        totalDocuments: info.points_count,
        totalVectors: info.vectors_count,
        averageVectorDimension: info.config.params.vectors.size,
      };
    } catch (error) {
      logger.error('Failed to get collection stats', { 
        collection: collectionName, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      const a = vectorA[i];
      const b = vectorB[i];
      if (a !== undefined && b !== undefined) {
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
      }
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Check if Qdrant is available
   */
  get isAvailable(): boolean {
    return this.isQdrantAvailable;
  }

  /**
   * Get fallback storage data (for debugging/testing)
   */
  getFallbackData(): Record<string, FallbackStorage> {
    return Object.fromEntries(this.fallbackStorage);
  }
}
