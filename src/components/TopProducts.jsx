import { useEffect, useMemo, useRef, useState } from "react";
import { getItemDisplayLabel } from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import {
  fetchItemsPriceHistoryBatch,
  fetchItemsPricesBatch,
} from "../shared/marketApi";

const TOP_LIMIT = 50;
const CANDIDATE_LIMIT = 900;
const BATCH_SIZE = 80;
const PRICE_CACHE_TTL_MS = 15 * 60 * 1000;
const PRICE_CACHE_RETENTION_MS = 24 * 60 * 60 * 1000;
const PRICE_CACHE_MAX_SCOPES = 24;
const PRICE_CACHE_STORAGE_KEY = "albion.topProducts.avgPrices.v1";

const cityOptions = [
  "global",
  "Bridgewatch",
  "Martlock",
  "Lymhurst",
  "Fort Sterling",
  "Thetford",
  "Caerleon",
  "Black Market",
  "Brecilien",
];

const categoryOptions = ["all", "resources", "gear"];

const timeframes = [
  { key: "24h", hours: 24, timeScale: 1, labelKey: "topProducts24h" },
  { key: "3d", hours: 72, timeScale: 24, labelKey: "topProducts3d" },
  { key: "7d", hours: 168, timeScale: 24, labelKey: "topProducts7d" },
  { key: "14d", hours: 336, timeScale: 24, labelKey: "topProducts14d" },
];

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function sumVolumesByItem(historyEntries, timeframeHours) {
  if (!Array.isArray(historyEntries) || historyEntries.length === 0) {
    return new Map();
  }

  let latestTimestamp = 0;
  for (const entry of historyEntries) {
    for (const point of entry?.data || []) {
      const ts = point?.timestamp ? new Date(point.timestamp).getTime() : 0;
      if (ts > latestTimestamp) latestTimestamp = ts;
    }
  }

  const cutoff =
    latestTimestamp > 0 ? latestTimestamp - timeframeHours * 3600 * 1000 : 0;
  const volumeByItem = new Map();

  for (const entry of historyEntries) {
    const itemId = entry?.item_id;
    if (!itemId) continue;

    let itemVolume = 0;
    for (const point of entry?.data || []) {
      const ts = point?.timestamp ? new Date(point.timestamp).getTime() : 0;
      if (cutoff > 0 && ts < cutoff) continue;
      itemVolume += Number(point?.item_count) || 0;
    }

    if (itemVolume <= 0) continue;
    volumeByItem.set(itemId, (volumeByItem.get(itemId) || 0) + itemVolume);
  }

  return volumeByItem;
}

function normalizeCandidates(itemsIndex) {
  const ids = (itemsIndex || []).map((item) => item?.id).filter(Boolean);
  const filtered = ids.filter((id) => {
    if (!/^T\d+_/.test(id)) return false;
    if (id.includes("@")) return false;
    if (id.includes("_SKIN") || id.includes("_MOUNTSKIN")) return false;
    if (id.includes("_UNIQUE") || id.includes("_TOKEN")) return false;
    return true;
  });

  return filtered.slice(0, CANDIDATE_LIMIT);
}

function getItemCategory(itemId) {
  const id = String(itemId || "");

  if (
    id.includes("_ORE") ||
    id.includes("_WOOD") ||
    id.includes("_FIBER") ||
    id.includes("_HIDE") ||
    id.includes("_ROCK") ||
    id.includes("_METALBAR") ||
    id.includes("_PLANKS") ||
    id.includes("_CLOTH") ||
    id.includes("_LEATHER") ||
    id.includes("_STONEBLOCK") ||
    id.includes("_RUNE") ||
    id.includes("_SOUL") ||
    id.includes("_RELIC") ||
    id.includes("_ESSENCE")
  ) {
    return "resources";
  }

  if (
    id.includes("_MAIN_") ||
    id.includes("_2H_") ||
    id.includes("_OFF_") ||
    id.includes("_HEAD_") ||
    id.includes("_ARMOR_") ||
    id.includes("_SHOES_") ||
    id.includes("_BAG") ||
    id.includes("_CAPE")
  ) {
    return "gear";
  }

  return "other";
}

function pruneCacheEntries(cacheByScope = {}) {
  const now = Date.now();
  const entries = Object.entries(cacheByScope || {})
    .filter(([_, value]) => value && typeof value === "object")
    .filter(([_, value]) => Number(value.savedAt) > 0 && value.data)
    .filter(
      ([_, value]) => now - Number(value.savedAt) <= PRICE_CACHE_RETENTION_MS,
    )
    .sort((a, b) => Number(b[1].savedAt) - Number(a[1].savedAt))
    .slice(0, PRICE_CACHE_MAX_SCOPES);

  return Object.fromEntries(entries);
}

function readPriceCacheFromStorage() {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(PRICE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const pruned = pruneCacheEntries(parsed);
    if (Object.keys(pruned).length !== Object.keys(parsed).length) {
      writePriceCacheToStorage(pruned);
    }
    return pruned;
  } catch {
    return {};
  }
}

function writePriceCacheToStorage(cacheByScope) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PRICE_CACHE_STORAGE_KEY,
      JSON.stringify(cacheByScope || {}),
    );
  } catch {
    // Ignore storage errors (quota/private mode).
  }
}

function getFreshScopeCache(scopeKey) {
  const allCache = readPriceCacheFromStorage();
  const entry = allCache?.[scopeKey];
  if (!entry || !entry.savedAt || !entry.data) return {};

  const age = Date.now() - Number(entry.savedAt);
  if (age > PRICE_CACHE_TTL_MS) return {};

  return entry.data;
}

function persistScopeCache(scopeKey, data) {
  const allCache = readPriceCacheFromStorage();
  allCache[scopeKey] = {
    savedAt: Date.now(),
    data: data || {},
  };
  writePriceCacheToStorage(pruneCacheEntries(allCache));
}

export default function TopProducts({ language, region }) {
  const { itemNameLookup, itemsIndex } = useItemsData(language);
  const [timeframeKey, setTimeframeKey] = useState("24h");
  const [categoryKey, setCategoryKey] = useState("all");
  const [cityKey, setCityKey] = useState("global");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rawHistoryEntries, setRawHistoryEntries] = useState([]);
  const [avgPricesByItem, setAvgPricesByItem] = useState({});
  const cacheRef = useRef(new Map());
  const priceCacheRef = useRef(new Map());

  const candidates = useMemo(
    () => normalizeCandidates(itemsIndex),
    [itemsIndex],
  );
  const timeframe =
    timeframes.find((option) => option.key === timeframeKey) || timeframes[0];
  const selectedTimeScale = timeframe.key === "24h" ? 1 : 24;
  const candidateSignature = useMemo(() => {
    if (!candidates.length) return "none";
    return `${candidates.length}:${candidates[0]}:${candidates[candidates.length - 1]}`;
  }, [candidates]);

  const rows = useMemo(() => {
    const cityFilteredEntries =
      cityKey === "global"
        ? rawHistoryEntries
        : rawHistoryEntries.filter(
            (entry) =>
              String(entry?.location || "").toLowerCase() ===
              cityKey.toLowerCase(),
          );

    const volumes = Array.from(
      sumVolumesByItem(cityFilteredEntries, timeframe.hours).entries(),
    );

    const filtered = volumes.filter(([itemId]) => {
      if (categoryKey === "all") return true;
      return getItemCategory(itemId) === categoryKey;
    });

    return filtered
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_LIMIT)
      .map(([itemId, volume], index) => ({
        rank: index + 1,
        itemId,
        volume,
      }));
  }, [rawHistoryEntries, cityKey, timeframe.hours, categoryKey]);

  useEffect(() => {
    if (!candidates.length) return;

    let cancelled = false;

    async function loadTopProducts() {
      setLoading(true);
      setError(null);

      try {
        const cacheKey = `${candidateSignature}|${region}|${selectedTimeScale}`;
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          if (!cancelled) {
            setRawHistoryEntries(cached);
            setLoading(false);
          }
          return;
        }

        const batches = chunkArray(candidates, BATCH_SIZE);
        const aggregated = [];

        for (const batch of batches) {
          const historyRaw = await fetchItemsPriceHistoryBatch(
            batch,
            region,
            selectedTimeScale,
          );
          if (Array.isArray(historyRaw) && historyRaw.length > 0) {
            aggregated.push(...historyRaw);
          }
        }

        cacheRef.current.set(cacheKey, aggregated);

        if (!cancelled) {
          setRawHistoryEntries(aggregated);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setRawHistoryEntries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTopProducts();

    return () => {
      cancelled = true;
    };
  }, [candidates, candidateSignature, region, selectedTimeScale]);

  useEffect(() => {
    const itemIds = rows.map((row) => row.itemId).filter(Boolean);
    if (itemIds.length === 0) {
      setAvgPricesByItem({});
      return;
    }

    let cancelled = false;

    async function loadAveragePrices() {
      try {
        const scopeKey = `${region}|${cityKey}`;
        const memoryScopeCache = priceCacheRef.current.get(scopeKey) || {};
        const storageScopeCache = getFreshScopeCache(scopeKey);
        const scopeCache = {
          ...storageScopeCache,
          ...memoryScopeCache,
        };
        const missingIds = itemIds.filter((id) => !scopeCache[id]);

        if (missingIds.length > 0) {
          const batches = chunkArray(missingIds, BATCH_SIZE);
          const locations = cityKey === "global" ? [] : [cityKey];

          for (const batch of batches) {
            const pricesRaw = await fetchItemsPricesBatch(
              batch,
              region,
              locations,
            );
            const grouped = new Map();

            for (const entry of pricesRaw || []) {
              const itemId = entry?.item_id;
              if (!itemId) continue;

              if (
                cityKey !== "global" &&
                String(entry?.city || "").toLowerCase() !==
                  cityKey.toLowerCase()
              ) {
                continue;
              }

              const current = grouped.get(itemId) || {
                sellSum: 0,
                sellCount: 0,
                buySum: 0,
                buyCount: 0,
              };

              const sell =
                Number(
                  entry?.sell_price_min || entry?.sell_price || entry?.price,
                ) || 0;
              const buy = Number(entry?.buy_price_max || entry?.buy_price) || 0;

              if (sell > 0) {
                current.sellSum += sell;
                current.sellCount += 1;
              }
              if (buy > 0) {
                current.buySum += buy;
                current.buyCount += 1;
              }

              grouped.set(itemId, current);
            }

            for (const id of batch) {
              const stats = grouped.get(id);
              scopeCache[id] = {
                avgSell:
                  stats && stats.sellCount > 0
                    ? stats.sellSum / stats.sellCount
                    : null,
                avgBuy:
                  stats && stats.buyCount > 0
                    ? stats.buySum / stats.buyCount
                    : null,
              };
            }
          }

          priceCacheRef.current.set(scopeKey, scopeCache);
          persistScopeCache(scopeKey, scopeCache);
        } else {
          priceCacheRef.current.set(scopeKey, scopeCache);
        }

        if (!cancelled) {
          const visible = {};
          for (const id of itemIds) {
            visible[id] = scopeCache[id] || { avgSell: null, avgBuy: null };
          }
          setAvgPricesByItem(visible);
        }
      } catch {
        if (!cancelled) {
          const fallback = {};
          for (const id of itemIds) {
            fallback[id] = { avgSell: null, avgBuy: null };
          }
          setAvgPricesByItem(fallback);
        }
      }
    }

    loadAveragePrices();

    return () => {
      cancelled = true;
    };
  }, [rows, region, cityKey]);

  function formatAvgPrice(value) {
    return value && value > 0 ? Math.round(value).toLocaleString() : "—";
  }

  return (
    <div className="fantasy-card">
      <div className="fantasy-header">
        <div className="fantasy-title-wrap">
          <div className="fantasy-badge">🏆</div>
          <div>
            <h2>{getUiText("topProductsTitle", language)}</h2>
            <p className="fantasy-subtitle">
              {getUiText("topProductsSubtitle", language)}
            </p>
          </div>
        </div>
      </div>

      <p className="fantasy-intro">{getUiText("topProductsIntro", language)}</p>

      <div className="fantasy-history-controls" style={{ marginBottom: 12 }}>
        <div className="fantasy-timeframe-btns">
          {timeframes.map((option) => (
            <button
              key={option.key}
              className={`fantasy-timeframe-btn${
                timeframeKey === option.key ? " active" : ""
              }`}
              onClick={() => setTimeframeKey(option.key)}
            >
              {getUiText(option.labelKey, language)}
            </button>
          ))}
        </div>
      </div>

      <div
        className="fantasy-price-checker-controls"
        style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}
      >
        <div className="fantasy-control-group">
          <label>{getUiText("topProductsCategory", language)}</label>
          <select
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value)}
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {getUiText(`topProductsCategory${option}`, language)}
              </option>
            ))}
          </select>
        </div>

        <div className="fantasy-control-group">
          <label>{getUiText("topProductsCity", language)}</label>
          <select value={cityKey} onChange={(e) => setCityKey(e.target.value)}>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city === "global"
                  ? getUiText("topProductsCityGlobal", language)
                  : city}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fantasy-summary">
        {loading && (
          <p className="fantasy-state">
            {getUiText("topProductsLoading", language)}
          </p>
        )}

        {error && (
          <p className="fantasy-state error">
            {getUiText("topProductsError", language)}: {error}
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="fantasy-summary-card">
            <div className="fantasy-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{getUiText("item", language)}</th>
                    <th>{getUiText("topProductsAvgSell", language)}</th>
                    <th>{getUiText("topProductsAvgBuy", language)}</th>
                    <th>{getUiText("volume", language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.itemId}>
                      <td>{row.rank}</td>
                      <td>
                        {getItemDisplayLabel(row.itemId, itemNameLookup) ||
                          row.itemId}
                      </td>
                      <td>
                        {formatAvgPrice(avgPricesByItem[row.itemId]?.avgSell)}
                      </td>
                      <td>
                        {formatAvgPrice(avgPricesByItem[row.itemId]?.avgBuy)}
                      </td>
                      <td>{Math.round(row.volume).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="fantasy-state">
            {getUiText("topProductsNoData", language)}
          </p>
        )}
      </div>
    </div>
  );
}
