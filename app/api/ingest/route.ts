import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DungeonRaidSchema, EncounterSchema, MechanicSchema } from '@/lib/types';
import { generateEmbeddings, buildMechanicText } from '@/lib/embeddings';
import { upsertMechanics, type UpsertVector } from '@/lib/vector-store';
import { registerMechanic } from '@/lib/rag';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const IngestRequestSchema = z.object({
  mechanics: z.array(
    z.object({
      mechanic: MechanicSchema,
      encounter: EncounterSchema,
      dungeonRaid: DungeonRaidSchema,
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (more restrictive for ingestion)
    const clientId = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientId, {
      maxRequests: 5,
      windowMs: 60000, // 1 minute
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validated = IngestRequestSchema.parse(body);

    // Build texts for embedding
    const texts: string[] = [];
    const metadata: Array<{
      mechanic: z.infer<typeof MechanicSchema>;
      encounter: z.infer<typeof EncounterSchema>;
      dungeonRaid: z.infer<typeof DungeonRaidSchema>;
    }> = [];

    for (const item of validated.mechanics) {
      const text = buildMechanicText(
        item.mechanic.name,
        item.mechanic.description,
        item.mechanic.solution,
        item.mechanic.tips,
        item.encounter.name,
        item.dungeonRaid.name
      );
      texts.push(text);
      metadata.push(item);
    }

    // Generate embeddings in batches
    const embeddings = await generateEmbeddings(texts, (processed, total) => {
      console.log(`Embedding progress: ${processed}/${total}`);
    });

    // Build vectors for Pinecone
    const vectors: UpsertVector[] = embeddings.map((embedding, index) => {
      const item = metadata[index];
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

    // Upsert to Pinecone
    await upsertMechanics(vectors);

    // Register in RAG store
    for (const item of validated.mechanics) {
      registerMechanic(item.mechanic, item.encounter, item.dungeonRaid);
    }

    return NextResponse.json({
      success: true,
      ingested: validated.mechanics.length,
      remaining: rateLimit.remaining,
    });
  } catch (error) {
    console.error('Ingest API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
