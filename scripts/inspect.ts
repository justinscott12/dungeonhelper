#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { listAllMechanics } from '../lib/vector-store';

async function main() {
  const args = process.argv.slice(2);
  const filterName = args[0]; // Optional: filter by dungeon/raid name

  console.log('Inspecting Pinecone Database');
  console.log('============================\n');

  if (!process.env.PINECONE_API_KEY) {
    console.error('Error: PINECONE_API_KEY environment variable is not set');
    process.exit(1);
  }

  try {
    const filter = filterName ? { dungeonRaidName: filterName } : undefined;
    
    if (filterName) {
      console.log(`Filtering by: ${filterName}\n`);
    }
    
    console.log('Fetching all mechanics from Pinecone...');
    const mechanics = await listAllMechanics(filter);
    
    console.log(`\n✓ Found ${mechanics.length} mechanics\n`);
    
    if (mechanics.length === 0) {
      console.log('No mechanics found in the database.');
      if (filterName) {
        console.log(`Try without a filter to see all mechanics, or check if "${filterName}" is the correct name.`);
      }
      process.exit(0);
    }
    
    // Group by dungeon/raid
    const grouped = mechanics.reduce((acc, m) => {
      const name = m.metadata.dungeonRaidName;
      if (!acc[name]) {
        acc[name] = [];
      }
      acc[name].push(m);
      return acc;
    }, {} as Record<string, typeof mechanics>);
    
    // Summary
    console.log('Summary by Dungeon/Raid:');
    console.log('------------------------');
    for (const [name, items] of Object.entries(grouped)) {
      const type = items[0].metadata.dungeonRaidType;
      console.log(`  ${name} (${type}): ${items.length} mechanics`);
    }
    
    // Detailed list
    console.log('\n\nDetailed List:');
    console.log('==============\n');
    
    for (const [name, items] of Object.entries(grouped)) {
      console.log(`\n${name} (${items[0].metadata.dungeonRaidType})`);
      console.log('─'.repeat(60));
      
      // Group by encounter
      const byEncounter = items.reduce((acc, m) => {
        const encName = m.metadata.encounterName;
        if (!acc[encName]) {
          acc[encName] = [];
        }
        acc[encName].push(m);
        return acc;
      }, {} as Record<string, typeof items>);
      
      for (const [encounterName, encMechanics] of Object.entries(byEncounter)) {
        console.log(`\n  ${encounterName} (${encMechanics.length} mechanics):`);
        for (const m of encMechanics) {
          console.log(`    - ${m.metadata.mechanicName} [${m.metadata.mechanicType}] (ID: ${m.id})`);
        }
      }
    }
    
  } catch (error) {
    console.error('\n✗ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
