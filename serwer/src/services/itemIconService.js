const RENDER_SERVICE_BASE =
  process.env.ALBION_RENDER_SERVICE_BASE ||
  "https://render.albiononline.com/v1/item";
const ICON_FETCH_TIMEOUT_MS = Number(
  process.env.ALBION_RENDER_TIMEOUT_MS ||
    process.env.ALBION_API_TIMEOUT_MS ||
    8000,
);
const ICON_CACHE_TTL_MS = Number(
  process.env.ITEM_ICON_CACHE_TTL_MS || 12 * 60 * 60 * 1000,
);
const ICON_CACHE_MAX_ENTRIES = Number(
  process.env.ITEM_ICON_CACHE_MAX_ENTRIES || 5000,
);

const iconCache = new Map();
const inflightFetches = new Map();

function normalizeItemIdentifier(itemId) {
  const value = String(itemId || "").trim();
  if (!value) return "";

  const levelMatch = value.match(/^(.*)_LEVEL([0-4])$/i);
  if (levelMatch) {
    return `${levelMatch[1]}@${levelMatch[2]}`;
  }

  return value;
}

function clampSize(size) {
  const n = Number(size);
  if (!Number.isFinite(n)) return 48;
  return Math.max(1, Math.min(217, Math.round(n)));
}

function normalizeQuality(quality) {
  if (quality === undefined || quality === null || quality === "") return null;
  const n = Number(quality);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function normalizeLocale(locale) {
  const value = String(locale || "").trim();
  return value || null;
}

function toCacheKey({ identifier, size, quality, locale }) {
  return `${identifier}|${size}|${quality ?? "-"}|${locale ?? "-"}`;
}

function ensureCacheBound() {
  if (iconCache.size <= ICON_CACHE_MAX_ENTRIES) return;

  let oldestKey = null;
  let oldestAccess = Infinity;

  for (const [key, entry] of iconCache.entries()) {
    if (entry.lastAccessed < oldestAccess) {
      oldestAccess = entry.lastAccessed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    iconCache.delete(oldestKey);
  }
}

function getCachedEntry(cacheKey, now = Date.now()) {
  const entry = iconCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= now) return null;
  entry.lastAccessed = now;
  return entry;
}

function getStaleEntry(cacheKey) {
  const entry = iconCache.get(cacheKey);
  if (!entry) return null;
  return entry;
}

async function fetchIconBuffer(url) {
  const timeoutMs =
    Number.isFinite(ICON_FETCH_TIMEOUT_MS) && ICON_FETCH_TIMEOUT_MS > 0
      ? ICON_FETCH_TIMEOUT_MS
      : 8000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const upstreamError = new Error(
        `Render service returned HTTP ${response.status}.`,
      );
      upstreamError.statusCode = response.status >= 500 ? 503 : 502;
      throw upstreamError;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/png";

    return { buffer, contentType };
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error("Render service request timed out.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    if (error?.statusCode) throw error;

    const networkError = new Error("Render service request failed.");
    networkError.statusCode = 503;
    throw networkError;
  } finally {
    clearTimeout(timeout);
  }
}

async function getItemIcon({ itemId, size, quality, locale }) {
  const identifier = normalizeItemIdentifier(itemId);
  if (!identifier) {
    const error = new Error("Invalid item identifier.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedSize = clampSize(size);
  const normalizedQuality = normalizeQuality(quality);
  const normalizedLocale = normalizeLocale(locale);
  const cacheKey = toCacheKey({
    identifier,
    size: normalizedSize,
    quality: normalizedQuality,
    locale: normalizedLocale,
  });

  const now = Date.now();
  const cached = getCachedEntry(cacheKey, now);
  if (cached) {
    return {
      buffer: cached.buffer,
      contentType: cached.contentType,
      cacheStatus: "HIT",
    };
  }

  const existingInflight = inflightFetches.get(cacheKey);
  if (existingInflight) {
    const sharedResult = await existingInflight;
    return {
      ...sharedResult,
      cacheStatus: "HIT",
    };
  }

  const query = new URLSearchParams({ size: String(normalizedSize) });
  if (normalizedQuality !== null) {
    query.set("quality", String(normalizedQuality));
  }
  if (normalizedLocale) {
    query.set("locale", normalizedLocale);
  }

  const url = `${RENDER_SERVICE_BASE}/${encodeURIComponent(identifier)}.png?${query.toString()}`;

  const inflight = (async () => {
    const fetched = await fetchIconBuffer(url);
    const entry = {
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      expiresAt: Date.now() + ICON_CACHE_TTL_MS,
      lastAccessed: Date.now(),
    };
    iconCache.set(cacheKey, entry);
    ensureCacheBound();
    return {
      buffer: entry.buffer,
      contentType: entry.contentType,
      cacheStatus: "MISS",
    };
  })();

  inflightFetches.set(cacheKey, inflight);

  try {
    return await inflight;
  } catch (error) {
    const stale = getStaleEntry(cacheKey);
    if (stale) {
      stale.lastAccessed = Date.now();
      return {
        buffer: stale.buffer,
        contentType: stale.contentType,
        cacheStatus: "STALE",
      };
    }
    throw error;
  } finally {
    inflightFetches.delete(cacheKey);
  }
}

module.exports = {
  getItemIcon,
};
