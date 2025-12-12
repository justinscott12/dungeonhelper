import { NextRequest } from 'next/server';
import { z } from 'zod';
import { retrieveRelevantMechanics, streamResponse, buildContext } from '@/lib/rag';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
  query: z.string().min(1).max(1000),
  filters: z
    .object({
      dungeonRaidName: z.string().optional(),
      encounterType: z.string().optional(),
      mechanicType: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientId, {
      maxRequests: 10,
      windowMs: 60000, // 1 minute
    });

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimit.resetAt,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validated = ChatRequestSchema.parse(body);

    // Ensure mechanic store is loaded (populates from JSON files if empty)
    const { extractDungeonName, loadMechanicStore } = await import('@/lib/rag');
    await loadMechanicStore();
    
    // Extract dungeon name from query if not already provided in filters
    const extractedDungeon = extractDungeonName(validated.query);
    
    // Use extracted dungeon name if filters don't already have one
    const filters = validated.filters || {};
    if (!filters.dungeonRaidName && extractedDungeon) {
      filters.dungeonRaidName = extractedDungeon;
    }

    // Retrieve relevant mechanics from historical data
    const searchResults = await retrieveRelevantMechanics(validated.query, {
      filter: filters,
      topK: 5,
    });

    // Build context from RAG results
    const context = buildContext(searchResults);

    // Convert messages to format expected by RAG
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
      validated.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          
          for await (const chunk of streamResponse(validated.query, context, conversationHistory)) {
            controller.enqueue(encoder.encode(chunk));
          }
          
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `\n\n[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);

    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          details: error.errors,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
