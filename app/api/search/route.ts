import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { retrieveRelevantMechanics } from '@/lib/rag';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { get, getSearchCacheKey, set } from '@/lib/cache';
import type { SearchRequest, SearchResult } from '@/lib/types';

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z
    .object({
      dungeonRaidName: z.string().optional(),
      encounterType: z.string().optional(),
      mechanicType: z.string().optional(),
      difficulty: z.string().optional(),
      contestModeOnly: z.boolean().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientId, {
      maxRequests: 20,
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
    const validated = SearchRequestSchema.parse(body);

    // Check cache
    const cacheKey = getSearchCacheKey(validated.query, validated.filters);
    const cached = get<SearchResult[]>(cacheKey);
    if (cached) {
      return NextResponse.json({
        results: cached,
        cached: true,
        remaining: rateLimit.remaining,
      });
    }

    // Perform search
    const results = await retrieveRelevantMechanics(validated.query, {
      filter: validated.filters,
      topK: validated.limit || 10,
    });

    // Cache results for 5 minutes
    set(cacheKey, results, 5 * 60 * 1000);

    return NextResponse.json({
      results,
      cached: false,
      remaining: rateLimit.remaining,
    });
  } catch (error) {
    console.error('Search API error:', error);

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
