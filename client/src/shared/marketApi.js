function toApiError(response) {
  return new Error(`HTTP ${response.status}`);
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
  const query = toQuery({
    region,
    timeScale,
    locations: locations && locations.length > 0 ? locations.join(",") : null,
  });
  const url = `/api/market/history/${encodeURIComponent(itemId)}${query}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw toApiError(response);
  }
  return response.json();
}

export async function fetchItemsPriceHistoryBatch(
  itemIds,
  region,
  timeScale = 24,
  locations = [],
) {
  const validIds = (itemIds || []).filter(Boolean);
  if (validIds.length === 0) return [];

  const query = toQuery({
    region,
    timeScale,
    locations: locations && locations.length > 0 ? locations.join(",") : null,
  });
  const url = `/api/market/history/${toIdsPath(validIds)}${query}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw toApiError(response);
  }
  return response.json();
}

export async function fetchItemsPricesBatch(itemIds, region, locations = []) {
  const validIds = (itemIds || []).filter(Boolean);
  if (validIds.length === 0) return [];

  const query = toQuery({
    region,
    locations: locations && locations.length > 0 ? locations.join(",") : null,
  });
  const url = `/api/market/prices/${toIdsPath(validIds)}${query}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw toApiError(response);
  }
  return response.json();
}
