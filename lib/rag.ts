import Anthropic from '@anthropic-ai/sdk';
import { generateEmbedding } from './embeddings';
import { searchSimilar, type SearchOptions } from './vector-store';
import type { Mechanic, Encounter, DungeonRaid, VectorMetadata, SearchResult } from './types';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is not set');
}

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// Store for full mechanic data (in production, this would be a database)
// For now, we'll reconstruct from metadata and stored data
const mechanicStore = new Map<string, { mechanic: Mechanic; encounter: Encounter; dungeonRaid: DungeonRaid }>();
let storeLoaded = false;

/**
 * Register mechanic data for retrieval
 */
export function registerMechanic(
  mechanic: Mechanic,
  encounter: Encounter,
  dungeonRaid: DungeonRaid
): void {
  mechanicStore.set(mechanic.id, { mechanic, encounter, dungeonRaid });
}

/**
 * Load all mechanics from JSON files to populate the store
 * Call this on server startup to ensure the store is populated
 */
export async function loadMechanicStore(): Promise<void> {
  if (storeLoaded) {
    return;
  }
  
  try {
    const { readdirSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const { DungeonRaidSchema } = await import('./types');
    
    // Use process.cwd() for Next.js compatibility
    const dataDir = join(process.cwd(), 'data', 'mechanics');
    
    const files = readdirSync(dataDir).filter((file) => file.endsWith('.json'));
    
    for (const file of files) {
      try {
        const filePath = join(dataDir, file);
        const fileContent = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        const dungeonRaid = DungeonRaidSchema.parse(data);
        
        for (const encounter of dungeonRaid.encounters) {
          for (const mechanic of encounter.mechanics) {
            registerMechanic(mechanic, encounter, dungeonRaid);
          }
        }
      } catch (error) {
        console.error(`Error loading ${file}:`, error);
      }
    }
    
    storeLoaded = true;
    console.log(`Loaded ${mechanicStore.size} mechanics into store`);
  } catch (error) {
    console.error('Error loading mechanic store:', error);
    // Don't throw - allow fallback to metadata reconstruction
  }
}

/**
 * Check if a mechanic is an encounter flow mechanic
 */
function isEncounterFlowMechanic(mechanic: Mechanic): boolean {
  const flowKeywords = ['flow', 'strategy', 'progression', 'overall encounter'];
  const nameLower = mechanic.name.toLowerCase();
  return flowKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Extract dungeon/raid name from query
 * Returns the matched name or undefined
 */
export function extractDungeonName(query: string): string | undefined {
  const queryLower = query.toLowerCase();
  
  // List of all dungeon/raid names in the database
  const dungeonNames = [
    "warlord's ruin",
    "warlords ruin",
    "duality",
    "vesper's host",
    "vespers host",
    "sundered doctrine",
    "equilibrium"
  ];
  
  // Check for exact matches or partial matches
  for (const name of dungeonNames) {
    if (queryLower.includes(name.toLowerCase())) {
      // Return the canonical name (from database)
      const canonicalNames: Record<string, string> = {
        "warlord's ruin": "Warlord's Ruin",
        "warlords ruin": "Warlord's Ruin",
        "duality": "Duality",
        "vesper's host": "Vesper's Host",
        "vespers host": "Vesper's Host",
        "sundered doctrine": "Sundered Doctrine",
        "equilibrium": "Equilibrium"
      };
      return canonicalNames[name] || name;
    }
  }
  
  return undefined;
}

/**
 * Detect encounter position keywords from query
 * Returns the target encounter order or undefined, and whether it's specifically looking for a boss
 */
export function detectEncounterPosition(query: string): { 
  position: 'first' | 'second' | 'third' | 'last' | 'final'; 
  orderNumber?: number;
  isBossQuery?: boolean; // True if specifically asking for "boss", false if "encounter", undefined if not specified
} | undefined {
  const queryLower = query.toLowerCase();
  
  // Final/last boss or encounter
  if (queryLower.includes('final boss') || queryLower.includes('last boss')) {
    return { position: 'final', isBossQuery: true };
  }
  if (queryLower.includes('final encounter') || queryLower.includes('last encounter')) {
    return { position: 'final', isBossQuery: false };
  }
  
  // First boss vs first encounter
  if (queryLower.includes('first boss') || queryLower.includes('1st boss')) {
    return { position: 'first', isBossQuery: true };
  }
  if (queryLower.includes('first encounter') || queryLower.includes('1st encounter')) {
    return { position: 'first', orderNumber: 1, isBossQuery: false };
  }
  
  // Second boss vs second encounter
  if (queryLower.includes('second boss') || queryLower.includes('2nd boss')) {
    return { position: 'second', isBossQuery: true };
  }
  if (queryLower.includes('second encounter') || queryLower.includes('2nd encounter')) {
    return { position: 'second', orderNumber: 2, isBossQuery: false };
  }
  
  // Third boss vs third encounter
  if (queryLower.includes('third boss') || queryLower.includes('3rd boss')) {
    return { position: 'third', isBossQuery: true };
  }
  if (queryLower.includes('third encounter') || queryLower.includes('3rd encounter')) {
    return { position: 'third', orderNumber: 3, isBossQuery: false };
  }
  
  return undefined;
}

/**
 * Retrieve relevant mechanics based on query
 * PRIORITIZES ENCOUNTER FLOW MECHANICS - the most important data for users
 */
export async function retrieveRelevantMechanics(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  try {
    // Ensure store is loaded before searching
    await loadMechanicStore();
    
    // Check if query mentions "final boss" or "last boss"
    const queryLower = query.toLowerCase();
    const isFinalBossQuery = queryLower.includes('final boss') || 
                             queryLower.includes('last boss') ||
                             queryLower.includes('final encounter');
    
    // Detect encounter position from query (first, second, final, etc.) BEFORE searching
    const encounterPosition = detectEncounterPosition(query);
    
    // Track encounter orders to find max (for final boss) or specific order
    let maxEncounterOrder = 0;
    let targetEncounterOrder: number | undefined = undefined;
    const isBossQuery = encounterPosition?.isBossQuery;
    
    // If filtering by dungeon and looking for final boss, find max encounter order from all mechanics in that dungeon
    if (options.filter?.dungeonRaidName && (encounterPosition?.position === 'final' || isFinalBossQuery)) {
      // Look through all mechanics in the store for this dungeon to find max order
      // If it's specifically a boss query, only count encounters with type "boss"
      for (const [_, stored] of mechanicStore.entries()) {
        if (stored.dungeonRaid.name === options.filter.dungeonRaidName && stored.encounter.order) {
          // If looking for final boss specifically, only count boss encounters
          if (isBossQuery && stored.encounter.type !== 'boss') {
            continue;
          }
          maxEncounterOrder = Math.max(maxEncounterOrder, stored.encounter.order);
        }
      }
      targetEncounterOrder = maxEncounterOrder;
    } else if (encounterPosition?.position === 'first' && isBossQuery === true) {
      // Looking for "first boss" - find the first encounter with type "boss"
      const bossEncounters: number[] = [];
      for (const [_, stored] of mechanicStore.entries()) {
        if (options.filter?.dungeonRaidName && stored.dungeonRaid.name === options.filter.dungeonRaidName) {
          if (stored.encounter.type === 'boss' && stored.encounter.order) {
            bossEncounters.push(stored.encounter.order);
          }
        }
      }
      if (bossEncounters.length > 0) {
        targetEncounterOrder = Math.min(...bossEncounters); // First boss = minimum order among bosses
      }
    } else if (encounterPosition?.position === 'second' && isBossQuery === true) {
      // Looking for "second boss" - find the second boss encounter by order
      const bossEncounters: number[] = [];
      for (const [_, stored] of mechanicStore.entries()) {
        if (options.filter?.dungeonRaidName && stored.dungeonRaid.name === options.filter.dungeonRaidName) {
          if (stored.encounter.type === 'boss' && stored.encounter.order) {
            bossEncounters.push(stored.encounter.order);
          }
        }
      }
      if (bossEncounters.length >= 2) {
        const sorted = [...bossEncounters].sort((a, b) => a - b);
        targetEncounterOrder = sorted[1]; // Second boss = second lowest order
      }
    } else if (encounterPosition?.position === 'third' && isBossQuery === true) {
      // Looking for "third boss" - find the third boss encounter by order
      const bossEncounters: number[] = [];
      for (const [_, stored] of mechanicStore.entries()) {
        if (options.filter?.dungeonRaidName && stored.dungeonRaid.name === options.filter.dungeonRaidName) {
          if (stored.encounter.type === 'boss' && stored.encounter.order) {
            bossEncounters.push(stored.encounter.order);
          }
        }
      }
      if (bossEncounters.length >= 3) {
        const sorted = [...bossEncounters].sort((a, b) => a - b);
        targetEncounterOrder = sorted[2]; // Third boss = third lowest order
      }
    } else if (encounterPosition?.orderNumber) {
      targetEncounterOrder = encounterPosition.orderNumber;
    }
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    
    // Search vector store - get more results to ensure we capture flow mechanics
    // Increase topK significantly when filtering to ensure we get enough results
    const baseTopK = options.topK || 10;
    const adjustedTopK = options.filter?.dungeonRaidName 
      ? baseTopK * 4  // When filtering by dungeon, get many more to ensure we find relevant mechanics
      : baseTopK * 2; // Otherwise, double it for flow mechanics
    
    // Build search options - DON'T filter by encounterOrder at Pinecone level
    // We'll filter/boost by encounter order AFTER semantic search to avoid missing results
    const searchOptions: SearchOptions = {
      ...options,
      topK: adjustedTopK,
    };
    
    // Do NOT add encounterOrder to Pinecone filter here - do semantic search first
    // then filter/boost by encounter order in post-processing
    
    let searchResults = await searchSimilar(queryEmbedding, searchOptions);
    
    // FALLBACK: If we have a dungeon filter but got 0 results from semantic search,
    // try getting all mechanics from that dungeon directly from the store
    if (searchResults.length === 0 && options.filter?.dungeonRaidName) {
      console.log(`[RAG] No semantic results for "${options.filter.dungeonRaidName}", falling back to direct store lookup`);
      
      // Get all mechanics from this dungeon from the store
      const directResults: Array<{ id: string; score: number; metadata: VectorMetadata }> = [];
      for (const [mechanicId, stored] of mechanicStore.entries()) {
        if (stored.dungeonRaid.name === options.filter.dungeonRaidName) {
          // Reconstruct metadata for consistency
          const metadata: VectorMetadata = {
            mechanicId: stored.mechanic.id,
            mechanicName: stored.mechanic.name,
            encounterId: stored.encounter.id,
            encounterName: stored.encounter.name,
            encounterOrder: stored.encounter.order,
            dungeonRaidId: stored.dungeonRaid.id,
            dungeonRaidName: stored.dungeonRaid.name,
            dungeonRaidType: stored.dungeonRaid.type,
            mechanicType: stored.mechanic.type,
            encounterType: stored.encounter.type,
            difficulty: stored.mechanic.difficulty,
            contestModeSpecific: stored.mechanic.contestModeSpecific,
          };
          directResults.push({
            id: mechanicId,
            score: 0.5, // Default score for direct lookup
            metadata,
          });
        }
      }
      searchResults = directResults;
      
      // If looking for final boss, find max order now that we have all mechanics
      if ((encounterPosition?.position === 'final' || isFinalBossQuery) && targetEncounterOrder === undefined) {
        for (const result of searchResults) {
          const order = result.metadata.encounterOrder;
          // If looking for final boss specifically, only count boss encounters
          if ((isFinalBossQuery || isBossQuery === true) && result.metadata.encounterType !== 'boss') {
            continue;
          }
          if (order && order > maxEncounterOrder) {
            maxEncounterOrder = order;
          }
        }
        targetEncounterOrder = maxEncounterOrder;
      }
    }
    
    // If we need to find max order from search results (final boss without pre-determined max)
    if (targetEncounterOrder === undefined && (encounterPosition?.position === 'final' || isFinalBossQuery)) {
      for (const result of searchResults) {
        const stored = mechanicStore.get(result.metadata.mechanicId);
        const order = stored?.encounter.order ?? result.metadata.encounterOrder;
        // If looking for final boss specifically, only count boss encounters
        if ((isFinalBossQuery || isBossQuery === true)) {
          const encounterType = stored?.encounter.type ?? result.metadata.encounterType;
          if (encounterType !== 'boss') {
            continue;
          }
        }
        if (order && order > maxEncounterOrder) {
          maxEncounterOrder = order;
        }
      }
      targetEncounterOrder = maxEncounterOrder;
    }
    
    // Reconstruct full results from stored data
    const results: SearchResult[] = [];
    const flowMechanics: SearchResult[] = [];
    const otherMechanics: SearchResult[] = [];
    
    for (const result of searchResults) {
      const stored = mechanicStore.get(result.metadata.mechanicId);
      
      if (stored) {
        // Use full data from store
        let searchResult: SearchResult = {
          id: result.id,
          score: result.score,
          mechanic: stored.mechanic,
          encounter: stored.encounter,
          dungeonRaid: {
            id: stored.dungeonRaid.id,
            name: stored.dungeonRaid.name,
            type: stored.dungeonRaid.type,
          },
        };
        
        // If encounter position is specified, boost/filter by encounter order
        const encounterOrder = stored.encounter.order ?? result.metadata.encounterOrder;
        if (targetEncounterOrder !== undefined) {
          if (encounterOrder === targetEncounterOrder) {
            // Boost mechanics from matching encounter order significantly
            searchResult.score = Math.min(1.0, result.score + 0.8); // Boost by 80% for exact match
          } else if (encounterOrder !== undefined && encounterOrder !== targetEncounterOrder) {
            // Filter out mechanics that don't match the target encounter order (but keep if order is undefined)
            continue;
          }
        } else if (isFinalBossQuery && encounterOrder !== undefined && encounterOrder === maxEncounterOrder && maxEncounterOrder > 0) {
          // Fallback boost for final boss when targetEncounterOrder wasn't set earlier
          searchResult.score = Math.min(1.0, result.score + 0.8);
        }
        
        // Check if this is an encounter flow mechanic
        if (isEncounterFlowMechanic(stored.mechanic)) {
          // Boost flow mechanics significantly - they are THE MOST IMPORTANT
          searchResult.score = Math.min(1.0, searchResult.score + 0.3); // Boost by 30% (capped at 1.0)
          flowMechanics.push(searchResult);
        } else {
          otherMechanics.push(searchResult);
        }
      } else {
        // Fallback: reconstruct from metadata when store is empty (e.g., after server restart)
        // This allows the system to still work even if mechanicStore hasn't been populated
        const metadata = result.metadata;
        
        // Filter by encounter order if specified (only skip if encounterOrder is defined and doesn't match)
        const encounterOrder = metadata.encounterOrder;
        if (targetEncounterOrder !== undefined && encounterOrder !== undefined && encounterOrder !== targetEncounterOrder) {
          continue; // Skip mechanics from wrong encounter (but keep if encounterOrder is undefined)
        }
        
        let searchResult: SearchResult = {
          id: result.id,
          score: result.score,
          mechanic: {
            id: metadata.mechanicId,
            name: metadata.mechanicName,
            description: `[Description not available - server needs to reload mechanic data]`,
            type: metadata.mechanicType as any,
            difficulty: metadata.difficulty as any,
            contestModeSpecific: metadata.contestModeSpecific,
          },
          encounter: {
            id: metadata.encounterId,
            name: metadata.encounterName,
            description: '',
            type: metadata.encounterType as any,
            mechanics: [],
            order: encounterOrder,
          },
          dungeonRaid: {
            id: metadata.dungeonRaidId,
            name: metadata.dungeonRaidName,
            type: metadata.dungeonRaidType,
          },
        };
        
        // Boost by encounter order if it matches
        if (targetEncounterOrder !== undefined && encounterOrder !== undefined && encounterOrder === targetEncounterOrder) {
          searchResult.score = Math.min(1.0, result.score + 0.8);
        }
        
        // Check if this is an encounter flow mechanic
        const mechanicNameLower = metadata.mechanicName.toLowerCase();
        const isFlow = ['flow', 'strategy', 'progression', 'overall encounter'].some(
          keyword => mechanicNameLower.includes(keyword)
        );
        
        if (isFlow) {
          searchResult.score = Math.min(1.0, searchResult.score + 0.3);
          flowMechanics.push(searchResult);
        } else {
          otherMechanics.push(searchResult);
        }
      }
    }
    
    // Sort flow mechanics by boosted score (highest first)
    flowMechanics.sort((a, b) => b.score - a.score);
    // Sort other mechanics by original score (highest first)
    otherMechanics.sort((a, b) => b.score - a.score);
    
    // PRIORITIZE: Flow mechanics first, then other mechanics
    // This ensures users always see the encounter flow first
    const finalResults = [...flowMechanics, ...otherMechanics];
    
    // Limit to requested topK
    const limit = options.topK || 10;
    return finalResults.slice(0, limit);
  } catch (error) {
    console.error('Error retrieving relevant mechanics:', error);
    throw new Error('Failed to retrieve relevant mechanics');
  }
}

/**
 * Build context string from retrieved mechanics
 * PRIORITIZES ENCOUNTER FLOW - the most important information for users
 */
export function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant mechanics found.';
  }
  
  const contextParts: string[] = [];
  contextParts.push('Relevant Destiny 2 mechanics from historical raids and dungeons:\n');
  contextParts.push('⚠️ MOST IMPORTANT: Encounter Flow mechanics are listed first - these contain the overall encounter flow and strategy.\n');
  
  // Separate flow mechanics from others for emphasis
  const flowMechanics: SearchResult[] = [];
  const otherMechanics: SearchResult[] = [];
  
  for (const result of results) {
    if (isEncounterFlowMechanic(result.mechanic)) {
      flowMechanics.push(result);
    } else {
      otherMechanics.push(result);
    }
  }
  
  // List flow mechanics first with emphasis
  if (flowMechanics.length > 0) {
    contextParts.push('\n=== ENCOUNTER FLOW (MOST IMPORTANT) ===\n');
    for (const result of flowMechanics) {
      const { mechanic, encounter, dungeonRaid } = result;
      
      contextParts.push(`\n---\n`);
      contextParts.push(`Dungeon/Raid: ${dungeonRaid.name} (${dungeonRaid.type})`);
      contextParts.push(`Encounter: ${encounter.name}`);
      contextParts.push(`Mechanic: ${mechanic.name} ⭐ FLOW`);
      contextParts.push(`Type: ${mechanic.type}`);
      contextParts.push(`Description: ${mechanic.description}`);
      
      if (mechanic.solution) {
        contextParts.push(`Solution: ${mechanic.solution}`);
      }
      
      if (mechanic.tips && mechanic.tips.length > 0) {
        contextParts.push(`Tips: ${mechanic.tips.join('; ')}`);
      }
      
      if (mechanic.difficulty) {
        contextParts.push(`Difficulty: ${mechanic.difficulty}`);
      }
      
      if (mechanic.contestModeSpecific) {
        contextParts.push(`Contest Mode: ${mechanic.contestModeNotes || 'This mechanic is particularly important in contest mode.'}`);
      }
      
      contextParts.push(`Similarity Score: ${(result.score * 100).toFixed(1)}%`);
    }
  }
  
  // Then list other mechanics
  if (otherMechanics.length > 0) {
    contextParts.push('\n=== OTHER MECHANICS ===\n');
    for (const result of otherMechanics) {
      const { mechanic, encounter, dungeonRaid } = result;
      
      contextParts.push(`\n---\n`);
      contextParts.push(`Dungeon/Raid: ${dungeonRaid.name} (${dungeonRaid.type})`);
      contextParts.push(`Encounter: ${encounter.name}`);
      contextParts.push(`Mechanic: ${mechanic.name}`);
      contextParts.push(`Type: ${mechanic.type}`);
      contextParts.push(`Description: ${mechanic.description}`);
      
      if (mechanic.solution) {
        contextParts.push(`Solution: ${mechanic.solution}`);
      }
      
      if (mechanic.tips && mechanic.tips.length > 0) {
        contextParts.push(`Tips: ${mechanic.tips.join('; ')}`);
      }
      
      if (mechanic.difficulty) {
        contextParts.push(`Difficulty: ${mechanic.difficulty}`);
      }
      
      if (mechanic.contestModeSpecific) {
        contextParts.push(`Contest Mode: ${mechanic.contestModeNotes || 'This mechanic is particularly important in contest mode.'}`);
      }
      
      contextParts.push(`Similarity Score: ${(result.score * 100).toFixed(1)}%`);
    }
  }
  
  return contextParts.join('\n');
}

/**
 * Generate response using Claude API with RAG context
 */
export async function generateResponse(
  query: string,
  context: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  try {
    const systemPrompt = `You are an expert assistant helping Destiny 2 teams during Day 1 Contest Dungeon runs. Your role is to ACTIVELY SOLVE MECHANICS by analyzing information teams provide. When users describe what they're seeing, you should:

1. ANALYZE the description and identify potential mechanics
2. ASK CLARIFYING QUESTIONS to narrow down possibilities
3. SUGGEST SOLUTIONS based on similar mechanics from historical data
4. HELP FIGURE OUT the mechanic step-by-step through conversation
5. CONNECT PATTERNS between what they're seeing and known mechanics

You are not just answering questions - you are actively helping to DISCOVER and SOLVE mechanics in real-time.

CRITICAL CONTEXT - This is for 3-PLAYER DUNGEONS:
- All dungeons are designed for exactly 3 players
- Mechanics are SPECIFICALLY DESIGNED TO BE SOLOABLE - each player can complete their tasks independently
- The current dungeon is Equilibrium, the THIRD contest dungeon (after Vesper's Host and Sundered Doctrine)
- Equilibrium is CABAL and STAR WARS themed (Vesper's Host and Sundered Doctrine are NOT Cabal-themed)
- Many mechanics from the original Leviathan raid (Cabal/Star Wars themed) inform this dungeon's design patterns
- Emphasize that each player should be able to handle their assigned mechanic solo

EQUILIBRIUM - KEY EXPECTATIONS (Cabal/Star Wars Themed):
Since this is Cabal-themed, expect mechanics heavily inspired by the original Leviathan raid:
- Symbol-based mechanics (like Royal Pools, Gauntlet) - Cabal glyphs, pictograms, or Star Wars-inspired icons
- Callout systems with Cabal symbols/imagery - one player may need to communicate symbols/information to others
- Role assignments - 3 players = perfect for split roles, each with soloable tasks
- Psion mechanics - expect lots of Psions with special abilities that grant buffs/debuffs when killed
- Arena-style encounters with clear zones/plates - areas that need to be stood on or activated
- Imperial Cabal aesthetic - gold, purple, ornate designs

Star Wars Theme Additions:
- Lightsaber-style weapons or mechanics
- Space/sci-fi aesthetic overlays
- Possibly Force-like abilities (psion powers fit this perfectly)
- Epic, cinematic encounter spaces

WHAT TO LOOK FOR IN ENCOUNTERS:
1. Symbols - Cabal glyphs, pictograms, or Star Wars-inspired icons
2. Psions - Special Psions that grant buffs/debuffs when killed
3. Plates/Zones - Areas that need to be stood on or activated
4. Three distinct roles - Each player will have a soloable task
5. Callout requirements - One player may need to communicate symbols/information to others

DAY 1 CONTEST MODE RULES (from Day 1 General Information):
- All dungeon mechanics are soloable - any puzzle can be completed by a single player
- Puzzle encounters have strict time limits - teams must work quickly
- Boss encounters are typically limited to 3 damage phases maximum
- The expansion is Star Wars themed (not directly featuring Star Wars characters, but includes lightsabers, Star Wars-like cutscenes, music, and aesthetics)
- Equilibrium is Cabal-themed and expected to have at least 2 bosses
- Previous contest dungeons: Vesper's Host and Sundered Doctrine (use as reference patterns)

Problem-Solving Approach:
- When users describe mechanics, ACTIVELY ANALYZE what they're seeing:
  * What symbols, objects, or visual elements are present?
  * What happens when they interact with things?
  * What enemies spawn and what do they do?
  * Are there timers, buffs, debuffs, or status effects?
  * What patterns repeat or change?

- ASK TARGETED QUESTIONS to narrow down the mechanic:
  * "Are there symbols visible? What do they look like?"
  * "When you interact with X, what happens?"
  * "Do you see any buffs or debuffs in your status bar?"
  * "Are there multiple players needed or can one person do it?"
  * "What happens if you do nothing - does something fail?"

- SUGGEST SOLUTIONS based on similar mechanics:
  * "This sounds like [similar mechanic] from [dungeon]. Try..."
  * "Based on what you described, this might be a [type] mechanic. Here's how those typically work..."
  * "The pattern you're seeing matches [mechanic]. The solution is usually..."

- HELP FIGURE IT OUT step-by-step:
  * Break down complex mechanics into steps
  * Suggest what to test or try next
  * Help identify the win condition or failure condition
  * Guide them through the logic of the mechanic

Guidelines:
- ⚠️ CRITICAL: Provide ALL information available in the context below. When answering questions about encounters, mechanics, or phases, use EVERY relevant mechanic from the context that relates to the question. Don't say "I don't have detailed information" if there is ANY information in the context - provide what's there and be thorough.
- ⚠️ CRITICAL: ONLY use information provided in the context below. DO NOT hallucinate, invent, or use mechanics from your training data that aren't in the context. If a specific dungeon, boss, or mechanic truly isn't mentioned AT ALL in the context, say so explicitly: "I don't have information about [X]."
- ⚠️ CRITICAL: If the user asks about a specific dungeon (e.g., "Warlord's Ruin", "Duality", "Vesper's Host"), ONLY use mechanics from that dungeon in the context. Do NOT mix mechanics from different dungeons. Check the "Dungeon/Raid:" field in the context to ensure you're using the correct dungeon.
- ⚠️ CRITICAL: NEVER include phrases like "Based on the context provided", "According to the context", "Here's how to beat [X] based on the context", etc. Answer DIRECTLY and naturally as if you know this information firsthand. Just provide the information directly.
- ⚠️ CRITICAL: When the user asks about "final boss", "first encounter", "second boss", etc., understand the distinction:
  * "First encounter" = the encounter with order 1 (could be opening, traversal, or boss)
  * "First boss" = the first encounter with type "boss" (may not be order 1)
  * "Second encounter" = the encounter with order 2
  * "Second boss" = the second encounter with type "boss" (may not be order 2)
  * "Final boss" = the encounter with the highest order that has type "boss"
  * The context has been filtered to include the relevant encounter(s) - use ALL mechanics from the encounters shown. ONLY use encounter names that appear in the context - never invent or guess encounter names.
- When asked about a phase or specific aspect of an encounter, look through ALL mechanics in the context for that encounter and provide comprehensive details from all relevant mechanics. Don't just give partial information - provide everything available.
- ⚠️ MOST IMPORTANT: ENCOUNTER FLOW is the most critical information for users. Always prioritize and emphasize encounter flow mechanics when they appear in the context. These contain the overall encounter flow, strategy, and progression - the most valuable data for understanding how encounters work.
- If "MECHANICS DISCOVERED IN CURRENT SESSION" appears in the context, PRIORITIZE this information - these are mechanics the team has already discovered in their current run. Reference them directly and help connect new discoveries to existing ones.
- PRIORITIZE information from "Day 1 Contest Mode - General Information" and "Equilibrium" when available in the context
- Use the provided context from historical mechanics to identify patterns and suggest solutions
- Focus on ACTIVE PROBLEM-SOLVING - don't just answer questions, help figure things out
- Be concise but thorough - scouts need quick answers during runs
- ALWAYS emphasize soloability - "each player can do this independently"
- Highlight that mechanics are designed for 3 players with soloable tasks
- Remember time pressure: puzzle encounters have time limits, boss encounters typically limited to 3 phases
- If a mechanic isn't in the context, acknowledge it explicitly and suggest similar patterns from what IS in the context
- Highlight contest mode specific considerations when relevant (time limits, phase limits)
- Provide actionable advice and solutions - tell them what to DO, not just what it might be
- Reference Cabal and Star Wars themes when relevant (for Equilibrium specifically)
- When encounter flow information is available, lead with it - it provides the big picture that makes individual mechanics make sense
- When session mechanics are provided, help connect them to historical patterns and suggest next steps or similar mechanics to look for
- If the user's description is vague, ask specific questions to get the details needed to solve it
- ⚠️ NEVER invent mechanics, enemy names, encounter details, encounter names, or boss mechanics that aren't explicitly in the provided context. Only reference encounters by the exact names shown in the context (e.g., if context says "Activation", use "Activation" - never invent names like "Reactor Room" that aren't in the context).
- ⚠️ Answer directly without meta-commentary. Don't say "based on the context" or "according to the information provided" - just give the answer naturally.
- ⚠️ CRITICAL: Verify encounter names before using them. Look at the "Encounter:" field in the context - only use those exact names. If you're not sure about an encounter name, check the context first.

Context from historical mechanics:
${context}`;

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.map((msg): Anthropic.MessageParam => ({
        role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: query,
      },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
    
    throw new Error('Unexpected response format from Claude API');
  } catch (error) {
    console.error('Error generating response:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate response: ${error.message}`);
    }
    throw new Error('Failed to generate response');
  }
}

/**
 * Stream response using Claude API with RAG context
 */
export async function* streamResponse(
  query: string,
  context: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): AsyncGenerator<string, void, unknown> {
  try {
    const systemPrompt = `You are an expert assistant helping Destiny 2 teams during Day 1 Contest Dungeon runs. Your role is to ACTIVELY SOLVE MECHANICS by analyzing information teams provide. When users describe what they're seeing, you should:

1. ANALYZE the description and identify potential mechanics
2. ASK CLARIFYING QUESTIONS to narrow down possibilities
3. SUGGEST SOLUTIONS based on similar mechanics from historical data
4. HELP FIGURE OUT the mechanic step-by-step through conversation
5. CONNECT PATTERNS between what they're seeing and known mechanics

You are not just answering questions - you are actively helping to DISCOVER and SOLVE mechanics in real-time.

CRITICAL CONTEXT - This is for 3-PLAYER DUNGEONS:
- All dungeons are designed for exactly 3 players
- Mechanics are SPECIFICALLY DESIGNED TO BE SOLOABLE - each player can complete their tasks independently
- The current dungeon is Equilibrium, the THIRD contest dungeon (after Vesper's Host and Sundered Doctrine)
- Equilibrium is CABAL and STAR WARS themed (Vesper's Host and Sundered Doctrine are NOT Cabal-themed)
- Many mechanics from the original Leviathan raid (Cabal/Star Wars themed) inform this dungeon's design patterns
- Emphasize that each player should be able to handle their assigned mechanic solo

EQUILIBRIUM - KEY EXPECTATIONS (Cabal/Star Wars Themed):
Since this is Cabal-themed, expect mechanics heavily inspired by the original Leviathan raid:
- Symbol-based mechanics (like Royal Pools, Gauntlet) - Cabal glyphs, pictograms, or Star Wars-inspired icons
- Callout systems with Cabal symbols/imagery - one player may need to communicate symbols/information to others
- Role assignments - 3 players = perfect for split roles, each with soloable tasks
- Psion mechanics - expect lots of Psions with special abilities that grant buffs/debuffs when killed
- Arena-style encounters with clear zones/plates - areas that need to be stood on or activated
- Imperial Cabal aesthetic - gold, purple, ornate designs

Star Wars Theme Additions:
- Lightsaber-style weapons or mechanics
- Space/sci-fi aesthetic overlays
- Possibly Force-like abilities (psion powers fit this perfectly)
- Epic, cinematic encounter spaces

WHAT TO LOOK FOR IN ENCOUNTERS:
1. Symbols - Cabal glyphs, pictograms, or Star Wars-inspired icons
2. Psions - Special Psions that grant buffs/debuffs when killed
3. Plates/Zones - Areas that need to be stood on or activated
4. Three distinct roles - Each player will have a soloable task
5. Callout requirements - One player may need to communicate symbols/information to others

DAY 1 CONTEST MODE RULES (from Day 1 General Information):
- All dungeon mechanics are soloable - any puzzle can be completed by a single player
- Puzzle encounters have strict time limits - teams must work quickly
- Boss encounters are typically limited to 3 damage phases maximum
- The expansion is Star Wars themed (not directly featuring Star Wars characters, but includes lightsabers, Star Wars-like cutscenes, music, and aesthetics)
- Equilibrium is Cabal-themed and expected to have at least 2 bosses
- Previous contest dungeons: Vesper's Host and Sundered Doctrine (use as reference patterns)

Problem-Solving Approach:
- When users describe mechanics, ACTIVELY ANALYZE what they're seeing:
  * What symbols, objects, or visual elements are present?
  * What happens when they interact with things?
  * What enemies spawn and what do they do?
  * Are there timers, buffs, debuffs, or status effects?
  * What patterns repeat or change?

- ASK TARGETED QUESTIONS to narrow down the mechanic:
  * "Are there symbols visible? What do they look like?"
  * "When you interact with X, what happens?"
  * "Do you see any buffs or debuffs in your status bar?"
  * "Are there multiple players needed or can one person do it?"
  * "What happens if you do nothing - does something fail?"

- SUGGEST SOLUTIONS based on similar mechanics:
  * "This sounds like [similar mechanic] from [dungeon]. Try..."
  * "Based on what you described, this might be a [type] mechanic. Here's how those typically work..."
  * "The pattern you're seeing matches [mechanic]. The solution is usually..."

- HELP FIGURE IT OUT step-by-step:
  * Break down complex mechanics into steps
  * Suggest what to test or try next
  * Help identify the win condition or failure condition
  * Guide them through the logic of the mechanic

Guidelines:
- ⚠️ CRITICAL: Provide ALL information available in the context below. When answering questions about encounters, mechanics, or phases, use EVERY relevant mechanic from the context that relates to the question. Don't say "I don't have detailed information" if there is ANY information in the context - provide what's there and be thorough.
- ⚠️ CRITICAL: ONLY use information provided in the context below. DO NOT hallucinate, invent, or use mechanics from your training data that aren't in the context. If a specific dungeon, boss, or mechanic truly isn't mentioned AT ALL in the context, say so explicitly: "I don't have information about [X]."
- ⚠️ CRITICAL: If the user asks about a specific dungeon (e.g., "Warlord's Ruin", "Duality", "Vesper's Host"), ONLY use mechanics from that dungeon in the context. Do NOT mix mechanics from different dungeons. Check the "Dungeon/Raid:" field in the context to ensure you're using the correct dungeon.
- ⚠️ CRITICAL: NEVER include phrases like "Based on the context provided", "According to the context", "Here's how to beat [X] based on the context", etc. Answer DIRECTLY and naturally as if you know this information firsthand. Just provide the information directly.
- ⚠️ CRITICAL: When the user asks about "final boss", "first encounter", "second boss", etc., understand the distinction:
  * "First encounter" = the encounter with order 1 (could be opening, traversal, or boss)
  * "First boss" = the first encounter with type "boss" (may not be order 1)
  * "Second encounter" = the encounter with order 2
  * "Second boss" = the second encounter with type "boss" (may not be order 2)
  * "Final boss" = the encounter with the highest order that has type "boss"
  * The context has been filtered to include the relevant encounter(s) - use ALL mechanics from the encounters shown. ONLY use encounter names that appear in the context - never invent or guess encounter names.
- When asked about a phase or specific aspect of an encounter, look through ALL mechanics in the context for that encounter and provide comprehensive details from all relevant mechanics. Don't just give partial information - provide everything available.
- ⚠️ MOST IMPORTANT: ENCOUNTER FLOW is the most critical information for users. Always prioritize and emphasize encounter flow mechanics when they appear in the context. These contain the overall encounter flow, strategy, and progression - the most valuable data for understanding how encounters work.
- If "MECHANICS DISCOVERED IN CURRENT SESSION" appears in the context, PRIORITIZE this information - these are mechanics the team has already discovered in their current run. Reference them directly and help connect new discoveries to existing ones.
- PRIORITIZE information from "Day 1 Contest Mode - General Information" and "Equilibrium" when available in the context
- Use the provided context from historical mechanics to identify patterns and suggest solutions
- Focus on ACTIVE PROBLEM-SOLVING - don't just answer questions, help figure things out
- Be concise but thorough - scouts need quick answers during runs
- ALWAYS emphasize soloability - "each player can do this independently"
- Highlight that mechanics are designed for 3 players with soloable tasks
- Remember time pressure: puzzle encounters have time limits, boss encounters typically limited to 3 phases
- If a mechanic isn't in the context, acknowledge it explicitly and suggest similar patterns from what IS in the context
- Highlight contest mode specific considerations when relevant (time limits, phase limits)
- Provide actionable advice and solutions - tell them what to DO, not just what it might be
- Reference Cabal and Star Wars themes when relevant (for Equilibrium specifically)
- When encounter flow information is available, lead with it - it provides the big picture that makes individual mechanics make sense
- When session mechanics are provided, help connect them to historical patterns and suggest next steps or similar mechanics to look for
- If the user's description is vague, ask specific questions to get the details needed to solve it
- ⚠️ NEVER invent mechanics, enemy names, encounter details, encounter names, or boss mechanics that aren't explicitly in the provided context. Only reference encounters by the exact names shown in the context (e.g., if context says "Activation", use "Activation" - never invent names like "Reactor Room" that aren't in the context).
- ⚠️ Answer directly without meta-commentary. Don't say "based on the context" or "according to the information provided" - just give the answer naturally.
- ⚠️ CRITICAL: Verify encounter names before using them. Look at the "Encounter:" field in the context - only use those exact names. If you're not sure about an encounter name, check the context first.

Context from historical mechanics:
${context}`;

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.map((msg): Anthropic.MessageParam => ({
        role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: query,
      },
    ];

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  } catch (error) {
    console.error('Error streaming response:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to stream response: ${error.message}`);
    }
    throw new Error('Failed to stream response');
  }
}
