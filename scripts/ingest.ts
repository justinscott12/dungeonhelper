#!/usr/bin/env node

/**
 * Data ingestion script for Destiny 2 mechanics
 * 
 * This script processes JSON files from data/mechanics/ and ingests them into Pinecone.
 * 
 * Usage:
 *   npm run ingest
 *   or
 *   tsx scripts/ingest.ts [file1.json] [file2.json] ...
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DungeonRaidSchema } from '../lib/types';
import { generateEmbeddings, buildMechanicText } from '../lib/embeddings';
import { upsertMechanics, ensureIndex, type UpsertVector } from '../lib/vector-store';
import { registerMechanic } from '../lib/rag';
import { EMBEDDING_DIMENSION } from '../lib/embeddings';

// Get the directory of the current script file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check for required environment variables
const requiredEnvVars = ['PINECONE_API_KEY', 'OPENAI_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is not set`);
    process.exit(1);
  }
}

async function ingestFile(filePath: string): Promise<void> {
  console.log(`\nProcessing ${filePath}...`);

  try {
    // Read and parse JSON file
    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    // Validate schema
    const dungeonRaid = DungeonRaidSchema.parse(data);
    console.log(`✓ Validated: ${dungeonRaid.name} (${dungeonRaid.type})`);

    // Build mechanics data
    const mechanicsData: Array<{
      mechanic: any;
      encounter: any;
      dungeonRaid: any;
    }> = [];

    for (const encounter of dungeonRaid.encounters) {
      for (const mechanic of encounter.mechanics) {
        mechanicsData.push({
          mechanic,
          encounter,
          dungeonRaid,
        });
      }
    }

    console.log(`  Found ${mechanicsData.length} mechanics across ${dungeonRaid.encounters.length} encounters`);

    if (mechanicsData.length === 0) {
      console.log('  ⚠ No mechanics to ingest');
      return;
    }

    // Build texts for embedding
    const texts: string[] = [];
    for (const item of mechanicsData) {
      const text = buildMechanicText(
        item.mechanic.name,
        item.mechanic.description,
        item.mechanic.solution,
        item.mechanic.tips,
        item.encounter.name,
        item.dungeonRaid.name
      );
      texts.push(text);
    }

    // Generate embeddings
    console.log('  Generating embeddings...');
    const embeddings = await generateEmbeddings(texts, (processed, total) => {
      process.stdout.write(`\r  Progress: ${processed}/${total} embeddings generated`);
    });
    console.log('\n  ✓ Embeddings generated');

    // Build vectors for Pinecone
    const vectors: UpsertVector[] = embeddings.map((embedding, index) => {
      const item = mechanicsData[index];
      return {
        id: item.mechanic.id,
        values: embedding,
        metadata: {
          mechanicId: item.mechanic.id,
          mechanicName: item.mechanic.name,
          encounterId: item.encounter.id,
          encounterName: item.encounter.name,
          encounterOrder: item.encounter.order,
          dungeonRaidId: item.dungeonRaid.id,
          dungeonRaidName: item.dungeonRaid.name,
          dungeonRaidType: item.dungeonRaid.type,
          mechanicType: item.mechanic.type,
          encounterType: item.encounter.type,
          difficulty: item.mechanic.difficulty,
          contestModeSpecific: item.mechanic.contestModeSpecific,
        },
      };
    });

    // Ensure index exists
    console.log('  Ensuring Pinecone index exists...');
    await ensureIndex(EMBEDDING_DIMENSION);
    console.log('  ✓ Index ready');

    // Upsert to Pinecone
    console.log('  Uploading to Pinecone...');
    await upsertMechanics(vectors);
    console.log('  ✓ Uploaded to Pinecone');

    // Register in RAG store (for runtime access)
    for (const item of mechanicsData) {
      registerMechanic(item.mechanic, item.encounter, item.dungeonRaid);
    }

    console.log(`✓ Successfully ingested ${mechanicsData.length} mechanics from ${dungeonRaid.name}`);
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error);
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    }
    throw error;
  }
}

async function main() {
  console.log('Destiny 2 Mechanics Ingestion Script');
  console.log('=====================================\n');

  // Get file paths from command line args or use all files in data/mechanics/
  const args = process.argv.slice(2);
  const dataDir = join(__dirname, '..', 'data', 'mechanics');
  
  let filePaths: string[] = [];
  
  if (args.length > 0) {
    // Use provided file paths
    filePaths = args.map((arg) => {
      if (arg.startsWith('/')) {
        return arg;
      }
      return join(process.cwd(), arg);
    });
  } else {
    // Use all JSON files in data/mechanics/
    const files = readdirSync(dataDir).filter((file) => file.endsWith('.json'));
    filePaths = files.map((file) => join(dataDir, file));
  }

  if (filePaths.length === 0) {
    console.error('No files to process. Provide file paths as arguments or ensure data/mechanics/ contains JSON files.');
    process.exit(1);
  }

  console.log(`Found ${filePaths.length} file(s) to process\n`);

  // Process each file
  let successCount = 0;
  let errorCount = 0;

  for (const filePath of filePaths) {
    try {
      await ingestFile(filePath);
      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`Failed to process ${filePath}`);
    }
  }

  console.log('\n=====================================');
  console.log('Ingestion Summary:');
  console.log(`  ✓ Success: ${successCount}`);
  console.log(`  ✗ Errors: ${errorCount}`);
  console.log('=====================================\n');

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
