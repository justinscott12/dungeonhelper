#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { deleteAllMechanics } from '../lib/vector-store';

async function main() {
  console.log('Wiping Pinecone Database...\n');
  if (!process.env.PINECONE_API_KEY) {
    console.error('Error: PINECONE_API_KEY environment variable is not set');
    process.exit(1);
  }
  try {
    await deleteAllMechanics();
    console.log('\n✓ Successfully wiped all data from Pinecone index');
    console.log('Run: npm run ingest');
  } catch (error) {
    console.error('\n✗ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
