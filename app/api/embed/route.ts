import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateEmbedding } from '@/lib/embeddings';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const EmbedRequestSchema = z.object({
  text: z.string().min(1).max(8000),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientId, {
      maxRequests: 50,
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
    const validated = EmbedRequestSchema.parse(body);

    // Generate embedding
    const embedding = await generateEmbedding(validated.text);

    return NextResponse.json({
      embedding,
      dimension: embedding.length,
      remaining: rateLimit.remaining,
    });
  } catch (error) {
    console.error('Embed API error:', error);

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
