// Simple in-memory cache
// In production, consider using Redis or Next.js cache

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

export function get<T>(key: string): T | null {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }
  
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

export function set<T>(key: string, data: T, ttlMs: number = 60000): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function del(key: string): void {
  cache.delete(key);
}

export function clear(): void {
  cache.clear();
}

/**
 * Generate cache key for search queries
 */
export function getSearchCacheKey(query: string, filters?: Record<string, any>): string {
  const filterStr = filters ? JSON.stringify(filters) : '';
  return `search:${query}:${filterStr}`;
}

/**
 * Generate cache key for chat responses
 */
export function getChatCacheKey(query: string, historyHash: string): string {
  return `chat:${historyHash}:${query}`;
}
