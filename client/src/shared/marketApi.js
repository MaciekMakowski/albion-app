function toApiError(response) {
  return new Error(`HTTP ${response.status}`);
}

const inflightRequests = new Map();
const responseCache = new Map();

function nowMs() {
  return Date.now();
}

function isForcedRefreshUrl(url) {
  return /[?&]refresh=true(?:&|$)/i.test(String(url || ""));
}

async function fetchJsonWithDedup(url, ttlMs = 0) {
  const cacheKey = String(url || "");
  const forceRefresh = isForcedRefreshUrl(cacheKey);

  if (!forceRefresh && ttlMs > 0) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs()) {
      return cached.payload;
    }
    if (cached) {
      responseCache.delete(cacheKey);
    }
  }

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    const response = await fetch(cacheKey);
    if (!response.ok) {
      throw toApiError(response);
    }
    const payload = await response.json();

    if (!forceRefresh && ttlMs > 0) {
      responseCache.set(cacheKey, {
        payload,
        expiresAt: nowMs() + ttlMs,
      });
    }

    return payload;
  })();

  inflightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

function toIdsPath(itemIds) {
  return (itemIds || [])
    .filter(Boolean)
    .map((id) => id)
    .join(",");
}

function toQuery(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function getRefreshParamsFromUrl() {
  if (typeof window === "undefined") return {};

  const urlParams = new URLSearchParams(window.location.search || "");
  const refresh = urlParams.get("refresh");
  const rule = urlParams.get("rule");

  if (refresh === "true" && rule) {
    return { refresh, rule };
  }

  return {};
}

export function getCityName(entry) {
  return entry.city || entry.location || entry.name || "";
}

export function getSellPrice(entry) {
  return entry.sell_price_min || entry.sell_price || entry.price || 0;
}

export function getBuyPrice(entry) {
  return entry.buy_price_max || entry.buy_price || 0;
}

export async function fetchItemPricesByCity(itemId, region) {
  const data = await fetchItemsPricesBatch([itemId], region);
  const byCity = new Map();

  for (const entry of data) {
    const city = getCityName(entry);
    if (!city) continue;

    const key = city.toLowerCase();
    const sell = getSellPrice(entry);
    const buy = getBuyPrice(entry);
    const existing = byCity.get(key);

    if (
      !existing ||
      (sell > 0 && (!existing.sell || sell < existing.sell)) ||
      (buy > 0 && (!existing.buy || buy > existing.buy))
    ) {
      byCity.set(key, {
        city,
        sell: sell || existing?.sell || 0,
        buy: buy || existing?.buy || 0,
      });
    }
  }

  return byCity;
}

export async function fetchItemMarketPrice(itemId, city, region) {
  try {
    const byCity = await fetchItemPricesByCity(itemId, region);
    if (city) {
      const matched = byCity.get(city.toLowerCase());
      return matched?.sell || 0;
    }

    let min = Infinity;
    for (const row of byCity.values()) {
      if (row.sell > 0 && row.sell < min) min = row.sell;
    }
    return min === Infinity ? 0 : min;
  } catch {
    return 0;
  }
}

export async function fetchItemPriceHistory(
  itemId,
  region,
  locations = [],
  timeScale = 24,
) {
  const refreshParams = getRefreshParamsFromUrl();
  const query = toQuery({
    region,
    timeScale,
    locations: locations && locations.length > 0 ? locations.join(",") : null,
    ...refreshParams,
  });
  const url = `/api/market/history/${encodeURIComponent(itemId)}${query}`;
  return fetchJsonWithDedup(url, 30_000);
}

export async function fetchItemsPriceHistoryBatch(
  itemIds,
  region,
  timeScale = 24,
  locations = [],
) {
  const validIds = (itemIds || []).filter(Boolean);
  if (validIds.length === 0) return [];

  const refreshParams = getRefreshParamsFromUrl();
  const query = toQuery({
    region,
    timeScale,
    locations: locations && locations.length > 0 ? locations.join(",") : null,
    ...refreshParams,
  });
  const url = `/api/market/history/${toIdsPath(validIds)}${query}`;
  return fetchJsonWithDedup(url, 20_000);
}

export async function fetchItemsPricesBatch(itemIds, region, locations = []) {
  const validIds = (itemIds || []).filter(Boolean);
  if (validIds.length === 0) return [];

  const refreshParams = getRefreshParamsFromUrl();
  const query = toQuery({
    region,
    locations: locations && locations.length > 0 ? locations.join(",") : null,
    ...refreshParams,
  });
  const url = `/api/market/prices/${toIdsPath(validIds)}${query}`;
  return fetchJsonWithDedup(url, 10_000);
}
