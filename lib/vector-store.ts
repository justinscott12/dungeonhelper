import { Pinecone } from '@pinecone-database/pinecone';
import type { VectorMetadata } from './types';

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'destiny-mechanics';

// Initialize Pinecone client
let pineconeClient: Pinecone | null = null;

export async function getPineconeClient(): Promise<Pinecone> {
  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY environment variable is not set');
  }
  
  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });
  }
  return pineconeClient;
}

export async function getIndex() {
  const client = await getPineconeClient();
  return client.index(PINECONE_INDEX_NAME);
}

export interface UpsertVector {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

/**
 * Upsert mechanics data to Pinecone vector store
 */
export async function upsertMechanics(vectors: UpsertVector[]): Promise<void> {
  try {
    const index = await getIndex();
    
    // Pinecone recommends batches of 100
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }
  } catch (error) {
    console.error('Error upserting mechanics to Pinecone:', error);
    throw new Error('Failed to upsert mechanics to vector store');
  }
}

export interface SearchOptions {
  filter?: {
    dungeonRaidName?: string;
    encounterType?: string;
    mechanicType?: string;
    difficulty?: string;
    contestModeSpecific?: boolean;
    encounterOrder?: number; // Filter by specific encounter order
  };
  topK?: number;
}

/**
 * Search for similar mechanics using semantic search
 */
export async function searchSimilar(
  queryVector: number[],
  options: SearchOptions = {}
): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
  try {
    const index = await getIndex();
    
    // Build Pinecone filter
    const filter: Record<string, any> = {};
    if (options.filter) {
      if (options.filter.dungeonRaidName) {
        filter.dungeonRaidName = { $eq: options.filter.dungeonRaidName };
      }
      if (options.filter.encounterType) {
        filter.encounterType = { $eq: options.filter.encounterType };
      }
      if (options.filter.mechanicType) {
        filter.mechanicType = { $eq: options.filter.mechanicType };
      }
      if (options.filter.difficulty) {
        filter.difficulty = { $eq: options.filter.difficulty };
      }
      if (options.filter.contestModeSpecific !== undefined) {
        filter.contestModeSpecific = { $eq: options.filter.contestModeSpecific };
      }
      if (options.filter.encounterOrder !== undefined) {
        filter.encounterOrder = { $eq: options.filter.encounterOrder };
      }
    }

    const queryRequest: any = {
      vector: queryVector,
      topK: options.topK || 10,
      includeMetadata: true,
    };

    if (Object.keys(filter).length > 0) {
      queryRequest.filter = filter;
    }

    const queryResponse = await index.query(queryRequest);

    return (queryResponse.matches || []).map((match) => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata as VectorMetadata,
    }));
  } catch (error) {
    console.error('Error searching Pinecone:', error);
    throw new Error('Failed to search vector store');
  }
}

/**
 * Delete mechanics from vector store by IDs
 */
export async function deleteMechanics(ids: string[]): Promise<void> {
  try {
    const index = await getIndex();
    
    // Pinecone delete accepts array of IDs
    await index.deleteMany(ids);
  } catch (error) {
    console.error('Error deleting mechanics from Pinecone:', error);
    throw new Error('Failed to delete mechanics from vector store');
  }
}

/**
 * Delete all vectors from the Pinecone index
 */
export async function deleteAllMechanics(): Promise<void> {
  try {
    const index = await getIndex();
    // Delete all vectors from default namespace
    await index.deleteAll();
    console.log('✓ All vectors deleted from Pinecone index');
  } catch (error) {
    console.error('Error deleting all mechanics from Pinecone:', error);
    throw new Error('Failed to delete all mechanics from vector store');
  }
}

/**
 * List all mechanics from the Pinecone index
 */
export async function listAllMechanics(
  filter?: { dungeonRaidName?: string }
): Promise<Array<{ id: string; metadata: VectorMetadata }>> {
  try {
    const index = await getIndex();
    const allResults: Array<{ id: string; metadata: VectorMetadata }> = [];
    
    // Build filter for query
    const queryFilter: Record<string, any> = {};
    if (filter?.dungeonRaidName) {
      queryFilter.dungeonRaidName = { $eq: filter.dungeonRaidName };
    }
    
    // Use query with a dummy vector to fetch all results
    // Create a zero vector (dimension 512)
    const dummyVector = new Array(512).fill(0);
    
    // Query with very large topK to get all results
    // Note: Pinecone has limits, so we may need to paginate if there are > 10k vectors
    const queryRequest: any = {
      vector: dummyVector,
      topK: 10000, // Large enough for most cases
      includeMetadata: true,
    };
    
    if (Object.keys(queryFilter).length > 0) {
      queryRequest.filter = queryFilter;
    }
    
    const queryResponse = await index.query(queryRequest);
    
    if (queryResponse.matches) {
      for (const match of queryResponse.matches) {
        allResults.push({
          id: match.id,
          metadata: match.metadata as VectorMetadata,
        });
      }
    }
    
    return allResults;
  } catch (error) {
    console.error('Error listing mechanics from Pinecone:', error);
    throw new Error('Failed to list mechanics from vector store');
  }
}

/**
 * Check if index exists and create if needed
 */
export async function ensureIndex(dimension: number = 512): Promise<void> {
  try {
    const client = await getPineconeClient();
    const indexes = await client.listIndexes();
    
    const indexExists = indexes.indexes?.some(
      (idx) => idx.name === PINECONE_INDEX_NAME
    );

    if (!indexExists) {
      await client.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });
      
      // Wait for index to be ready
      let ready = false;
      let attempts = 0;
      while (!ready && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const indexStatus = await client.describeIndex(PINECONE_INDEX_NAME);
        ready = indexStatus.status?.ready === true;
        attempts++;
      }
      
      if (!ready) {
        throw new Error('Index creation timed out');
      }
    }
  } catch (error) {
    console.error('Error ensuring index exists:', error);
    throw new Error('Failed to ensure index exists');
  }
}
