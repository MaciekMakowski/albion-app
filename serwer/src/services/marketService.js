const { buildQuery } = require("../utils/marketParams");

const ALBION_API_TIMEOUT_MS = Number(process.env.ALBION_API_TIMEOUT_MS || 8000);
const ALBION_API_RETRY_COUNT = Number(process.env.ALBION_API_RETRY_COUNT || 2);
const ALBION_API_RETRY_BASE_DELAY_MS = Number(
  process.env.ALBION_API_RETRY_BASE_DELAY_MS || 200,
);

function getHostForRegion(region) {
  return region === "europe"
    ? "https://europe.albion-online-data.com"
    : region === "west"
      ? "https://west.albion-online-data.com"
      : "https://east.albion-online-data.com";
}

async function fetchAlbionJson(url) {
  const timeoutMs =
    Number.isFinite(ALBION_API_TIMEOUT_MS) && ALBION_API_TIMEOUT_MS > 0
      ? ALBION_API_TIMEOUT_MS
      : 8000;
  const maxRetries =
    Number.isFinite(ALBION_API_RETRY_COUNT) && ALBION_API_RETRY_COUNT >= 0
      ? ALBION_API_RETRY_COUNT
      : 2;
  const baseDelayMs =
    Number.isFinite(ALBION_API_RETRY_BASE_DELAY_MS) &&
    ALBION_API_RETRY_BASE_DELAY_MS > 0
      ? ALBION_API_RETRY_BASE_DELAY_MS
      : 200;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        const transient = response.status >= 500 || response.status === 429;
        if (transient && attempt < maxRetries) {
          await sleep(baseDelayMs * 2 ** attempt);
          continue;
        }

        const upstreamError = new Error(
          "Albion API returned an invalid response.",
        );
        upstreamError.statusCode = response.status >= 500 ? 503 : 502;
        upstreamError.details = `HTTP ${response.status}`;
        throw upstreamError;
      }

      return response.json();
    } catch (error) {
      if (error && error.name === "AbortError") {
        lastError = new Error("Albion API request timed out.");
        lastError.statusCode = 504;
      } else if (error && error.statusCode) {
        lastError = error;
      } else {
        lastError = new Error("Albion API request failed.");
        lastError.statusCode = 503;
      }

      if (attempt < maxRetries && isRetriableError(lastError)) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Albion API request failed.");
}

function isRetriableError(error) {
  const statusCode = error?.statusCode;
  return statusCode === 503 || statusCode === 504;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toAtAlias(itemId) {
  // T5_WOOD_LEVEL1 -> T5_WOOD_LEVEL1@1
  const match = String(itemId || "").match(/^(.*_LEVEL([1-4]))$/i);
  if (!match) return null;
  return `${match[1]}@${match[2]}`;
}

function toLevelAlias(itemId) {
  // T5_WOOD_LEVEL1@1 -> T5_WOOD_LEVEL1
  const match = String(itemId || "").match(/^(.*_LEVEL[1-4])@[1-4]$/);
  if (!match) return null;
  return match[1];
}

function buildItemIdAliasPlan(itemIds) {
  const requested = (itemIds || [])
    .map((id) => String(id || ""))
    .filter(Boolean);
  const upstreamIds = [];
  const upstreamSeen = new Set();
  const responseIdByUpstream = new Map();

  // Exact requested ids always keep their own representation.
  for (const id of requested) {
    responseIdByUpstream.set(id.toLowerCase(), id);
  }

  for (const id of requested) {
    const aliases = [id, toAtAlias(id), toLevelAlias(id)].filter(Boolean);

    for (const alias of aliases) {
      const key = alias.toLowerCase();
      if (!upstreamSeen.has(key)) {
        upstreamSeen.add(key);
        upstreamIds.push(alias);
      }

      if (!responseIdByUpstream.has(key)) {
        responseIdByUpstream.set(key, id);
      }
    }
  }

  return { upstreamIds, responseIdByUpstream };
}

function normalizeMarketRows(rows, responseIdByUpstream) {
  if (!Array.isArray(rows)) return rows;

  return rows.map((entry) => {
    const upstreamId =
      typeof entry?.item_id === "string"
        ? entry.item_id
        : typeof entry?.ItemId === "string"
          ? entry.ItemId
          : null;

    if (!upstreamId) return entry;

    const normalizedId =
      responseIdByUpstream.get(upstreamId.toLowerCase()) || upstreamId;

    if (normalizedId === upstreamId) return entry;

    const nextEntry = { ...entry };
    if (Object.prototype.hasOwnProperty.call(nextEntry, "item_id")) {
      nextEntry.item_id = normalizedId;
    }
    if (Object.prototype.hasOwnProperty.call(nextEntry, "ItemId")) {
      nextEntry.ItemId = normalizedId;
    }
    if (
      !Object.prototype.hasOwnProperty.call(nextEntry, "item_id") &&
      !Object.prototype.hasOwnProperty.call(nextEntry, "ItemId")
    ) {
      nextEntry.item_id = normalizedId;
    }

    return nextEntry;
  });
}

async function fetchPrices({ region, itemIds, locations }) {
  const host = getHostForRegion(region);
  const { upstreamIds, responseIdByUpstream } = buildItemIdAliasPlan(itemIds);
  const encodedPath = upstreamIds.map((id) => encodeURIComponent(id)).join(",");
  const query = buildQuery({
    locations: locations.length > 0 ? locations.join(",") : null,
  });
  const url = `${host}/api/v2/stats/prices/${encodedPath}.json${query}`;
  const rows = await fetchAlbionJson(url);
  return normalizeMarketRows(rows, responseIdByUpstream);
}

async function fetchHistory({ region, itemIds, locations, timeScale }) {
  const host = getHostForRegion(region);
  const { upstreamIds, responseIdByUpstream } = buildItemIdAliasPlan(itemIds);
  const encodedPath = upstreamIds.map((id) => encodeURIComponent(id)).join(",");
  const query = buildQuery({
    "time-scale": timeScale,
    locations: locations.length > 0 ? locations.join(",") : null,
  });
  const url = `${host}/api/v2/stats/history/${encodedPath}.json${query}`;
  const rows = await fetchAlbionJson(url);
  return normalizeMarketRows(rows, responseIdByUpstream);
}

module.exports = {
  fetchPrices,
  fetchHistory,
};
