import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 512; // Reduced to match Pinecone free tier limit
const BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per request, but we'll batch smaller

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSION,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embeddings for multiple texts in batches
 */
export async function generateEmbeddings(
  texts: string[],
  onProgress?: (processed: number, total: number) => void
): Promise<number[][]> {
  const embeddings: number[][] = [];
  let processed = 0;

  try {
    // Process in batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSION,
      });

      const batchEmbeddings = response.data.map((item) => item.embedding);
      embeddings.push(...batchEmbeddings);
      
      processed += batch.length;
      if (onProgress) {
        onProgress(processed, texts.length);
      }

      // Rate limiting: wait a bit between batches to avoid hitting rate limits
      if (i + BATCH_SIZE < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
    throw new Error('Failed to generate embeddings');
  }
}

/**
 * Build text representation of a mechanic for embedding
 */
export function buildMechanicText(
  mechanicName: string,
  description: string,
  solution?: string,
  tips?: string[],
  encounterName?: string,
  dungeonRaidName?: string
): string {
  const parts: string[] = [];
  
  parts.push(`Mechanic: ${mechanicName}`);
  if (dungeonRaidName) parts.push(`Location: ${dungeonRaidName}`);
  if (encounterName) parts.push(`Encounter: ${encounterName}`);
  parts.push(`Description: ${description}`);
  
  if (solution) {
    parts.push(`Solution: ${solution}`);
  }
  
  if (tips && tips.length > 0) {
    parts.push(`Tips: ${tips.join(' ')}`);
  }
  
  return parts.join('\n');
}

export { EMBEDDING_DIMENSION };
