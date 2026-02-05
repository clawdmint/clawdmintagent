/**
 * In-memory rate limiter for API endpoints
 * 
 * SECURITY: Prevents abuse of registration, deployment, and admin endpoints.
 * Uses a sliding window approach with automatic cleanup.
 * 
 * Note: This is per-instance (not distributed). For multi-instance deployments,
 * use Redis-based rate limiting instead.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

// In-memory store (per serverless function instance)
const store = new Map<string, RateLimitEntry>();

// Cleanup interval: remove expired entries every 5 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keys = Array.from(store.keys());
    for (const key of keys) {
      const entry = store.get(key);
      if (entry && now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Don't keep the process alive just for cleanup
  if (cleanupInterval && typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

export interface RateLimitConfig {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

/**
 * Check and consume a rate limit token
 * 
 * @param identifier - Unique key (e.g. IP address, API key hash, agent ID)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const key = identifier;
  const entry = store.get(key);

  // No existing entry or window expired - create new
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  // Window still active
  if (entry.count >= config.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds,
    };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client IP from request headers (works behind proxies)
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP (original client)
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Netlify-specific header
  const clientIp = request.headers.get("x-nf-client-connection-ip");
  if (clientIp) {
    return clientIp;
  }

  return "unknown";
}

// ═══════════════════════════════════════════════════════════════════════
// PRESET CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════

/** Agent registration: 5 per hour per IP */
export const RATE_LIMIT_REGISTER: RateLimitConfig = {
  maxRequests: 5,
  windowSeconds: 3600,
};

/** Collection deployment: 10 per hour per agent */
export const RATE_LIMIT_DEPLOY: RateLimitConfig = {
  maxRequests: 10,
  windowSeconds: 3600,
};

/** Admin endpoints: 20 per minute per IP */
export const RATE_LIMIT_ADMIN: RateLimitConfig = {
  maxRequests: 20,
  windowSeconds: 60,
};

/** Mint recording: 30 per minute per IP */
export const RATE_LIMIT_MINT: RateLimitConfig = {
  maxRequests: 30,
  windowSeconds: 60,
};

/** General API: 100 per minute per IP */
export const RATE_LIMIT_GENERAL: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
};
