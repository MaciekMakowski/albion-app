const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const responseCache = new Map();

function cacheMiddleware(ttlMs = DEFAULT_CACHE_TTL_MS) {
  return (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }

    const cacheKey = `${req.method}:${req.originalUrl}`;
    const now = Date.now();
    const cached = responseCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      res.set("X-Cache", "HIT");
      res.status(cached.statusCode).json(cached.payload);
      return;
    }

    if (cached) {
      req.staleCacheEntry = cached;
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        responseCache.set(cacheKey, {
          statusCode: res.statusCode,
          payload,
          expiresAt: Date.now() + ttlMs,
        });
      }
      res.set("X-Cache", "MISS");
      return originalJson(payload);
    };

    next();
  };
}

module.exports = {
  cacheMiddleware,
};
