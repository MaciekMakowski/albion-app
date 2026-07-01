const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const responseCache = new Map();

function toBoolean(value) {
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true";
}

function getNormalizedCacheKey(req) {
  const url = new URL(req.originalUrl, "http://localhost");
  url.searchParams.delete("refresh");
  url.searchParams.delete("rule");

  const sortedParams = [...url.searchParams.entries()].sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });
  const normalizedQuery = new URLSearchParams(sortedParams).toString();

  return `${req.method}:${url.pathname}${normalizedQuery ? `?${normalizedQuery}` : ""}`;
}

function cacheMiddleware(ttlMs = DEFAULT_CACHE_TTL_MS) {
  return (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }

    const cacheKey = getNormalizedCacheKey(req);
    const shouldForceRefresh =
      toBoolean(req.query.refresh) && String(req.query.rule || "") === "admin";
    const now = Date.now();
    const cached = shouldForceRefresh ? null : responseCache.get(cacheKey);

    if (shouldForceRefresh) {
      responseCache.delete(cacheKey);
      res.set("X-Cache", "REFRESH");
    }

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
      res.set("X-Cache", shouldForceRefresh ? "REFRESH" : "MISS");
      return originalJson(payload);
    };

    next();
  };
}

module.exports = {
  cacheMiddleware,
};
