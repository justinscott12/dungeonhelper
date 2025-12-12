// Simple in-memory rate limiter
// In production, consider using Redis or a more robust solution

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitStore>();

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { maxRequests: 10, windowMs: 60000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  
  let record = store.get(key);
  
  // Clean up expired entries
  if (record && record.resetTime < now) {
    record = undefined;
    store.delete(key);
  }
  
  if (!record) {
    // Create new record
    record = {
      count: 1,
      resetTime: now + options.windowMs,
    };
    store.set(key, record);
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: record.resetTime,
    };
  }
  
  if (record.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetTime,
    };
  }
  
  record.count++;
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    resetAt: record.resetTime,
  };
}

/**
 * Get client identifier from request (IP address or API key)
 */
export function getClientIdentifier(request: Request): string {
  // Try to get IP from headers (Vercel, Cloudflare, etc.)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  // Fallback to a default identifier
  return 'unknown';
}
