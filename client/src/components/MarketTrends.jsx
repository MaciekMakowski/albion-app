import { useEffect, useState } from "react";
import { getItemDisplayLabel } from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { fetchItemsPriceHistoryBatch } from "../shared/marketApi";
import MiniSparkline from "./MiniSparkline";

const TRENDS_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours - trends change frequently
const TRENDS_CACHE_STORAGE_KEY = "albion.marketTrends.v1";
const TOP_ITEMS_LIMIT = 100;
const BATCH_SIZE = 80;

const cityOptions = [
  "Bridgewatch",
  "Martlock",
  "Lymhurst",
  "Fort Sterling",
  "Thetford",
  "Caerleon",
  "Black Market",
  "Brecilien",
];

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function normalizeMarketTrendIds(itemsIndex) {
  const ids = (itemsIndex || []).map((item) => item?.id).filter(Boolean);
  const filtered = ids.filter((id) => {
    if (!/^T\d+_/.test(id)) return false;
    if (id.includes("@")) return false;
    if (id.includes("_SKIN") || id.includes("_MOUNTSKIN")) return false;
    if (id.includes("_UNIQUE") || id.includes("_TOKEN")) return false;
    return true;
  });

  return filtered.slice(0, TOP_ITEMS_LIMIT);
}

function calculateTrend(historyData, daysBack) {
  if (!historyData || historyData.length === 0) return null;

  const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const prices = [];
  const priceHistory = []; // Store all prices for sparkline
  const cityPrices = new Map(); // Track latest price per city

  for (const entry of historyData) {
    const location = entry.location || "Unknown";

    if (!entry.data || entry.data.length === 0) continue;

    for (const point of entry.data) {
      const ts = point.timestamp ? new Date(point.timestamp).getTime() : 0;
      if (ts >= cutoffTime) {
        const avgPrice = point.avg_price || 0;
        if (avgPrice > 0) {
          prices.push({ ts, price: avgPrice, location });
          priceHistory.push(avgPrice); // Add to sparkline data
          // Track latest price per city
          if (!cityPrices.has(location) || cityPrices.get(location).ts < ts) {
            cityPrices.set(location, { ts, price: avgPrice });
          }
        }
      }
    }
  }

  if (prices.length < 2) {
    return null;
  }

  // Sort by timestamp
  prices.sort((a, b) => a.ts - b.ts);

  // Require data to span at least 20% of the timeframe to be meaningful
  const timeSpanMs = prices[prices.length - 1].ts - prices[0].ts;
  const minSpanMs = daysBack * 0.2 * 24 * 60 * 60 * 1000;
  if (timeSpanMs < minSpanMs) {
    return null;
  }
  // Sort sparkline prices by timestamp to show trend over time
  priceHistory.sort(
    (a, b) =>
      prices.findIndex((p) => p.price === a) -
      prices.findIndex((p) => p.price === b),
  );

  const oldestPrice = prices[0].price;
  const latestPrice = prices[prices.length - 1].price;
  const change = latestPrice - oldestPrice;
  const changePercent = oldestPrice > 0 ? (change / oldestPrice) * 100 : 0;

  // Find city with highest price
  let bestCity = "Unknown";
  let bestPrice = 0;
  for (const [city, data] of cityPrices.entries()) {
    if (data.price > bestPrice) {
      bestPrice = data.price;
      bestCity = city;
    }
  }

  return {
    oldestPrice: Math.floor(oldestPrice),
    latestPrice: Math.floor(latestPrice),
    change: Math.floor(change),
    changePercent: Math.round(changePercent * 100) / 100,
    isUp: change > 0,
    bestCity,
    bestPrice: Math.floor(bestPrice),
    priceHistory: priceHistory.slice(0, 60), // Keep last 60 data points for sparkline
  };
}

export default function MarketTrends({ language, region }) {
  const { itemsIndex, itemNameLookup } = useItemsData(language);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState("7d"); // "7d" or "30d"

  const cacheKey = `${TRENDS_CACHE_STORAGE_KEY}.${region}.${timeframe}`;
  const daysBack = timeframe === "7d" ? 7 : 30;
  const timeScaleHours = timeframe === "7d" ? 168 : 720; // Convert days to hours for API

  useEffect(() => {
    if (!itemsIndex || itemsIndex.length === 0) return;

    const controller = new AbortController();

    setTrends([]); // Clear immediately before loading
    loadMarketTrends(controller.signal);

    return () => controller.abort(); // Cancel pending request if dependencies change
  }, [itemsIndex, region, timeframe]);

  const loadMarketTrends = async (signal) => {
    if (signal?.aborted) return; // Exit if already aborted

    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < TRENDS_CACHE_TTL_MS) {
          if (signal?.aborted) return; // Check before processing cached data
          processAndDisplayTrends(data, daysBack);
          setLoading(false);
          return;
        }
      }

      // Fetch top items
      const itemIds = normalizeMarketTrendIds(itemsIndex);
      if (itemIds.length === 0) {
        setError("No items to analyze");
        setLoading(false);
        return;
      }

      // Batch fetch price history
      const chunks = chunkArray(itemIds, BATCH_SIZE);
      let allHistoryData = [];

      for (const chunk of chunks) {
        if (signal?.aborted) return; // Exit if request was cancelled

        try {
          const history = await fetchItemsPriceHistoryBatch(
            chunk,
            region,
            timeScaleHours,
            cityOptions,
          );
          allHistoryData = allHistoryData.concat(history || []);
        } catch (err) {
          console.warn("Error fetching history batch:", err);
        }
      }

      // Cache the results
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: allHistoryData,
          timestamp: Date.now(),
        }),
      );

      if (signal?.aborted) return; // Exit if request was cancelled before processing

      processAndDisplayTrends(allHistoryData, daysBack);
    } catch (err) {
      if (!signal?.aborted) {
        // Only show error if not cancelled
        setError("Error loading market trends: " + err.message);
        console.error(err);
      }
    } finally {
      if (!signal?.aborted) {
        // Only update loading if not cancelled
        setLoading(false);
      }
    }
  };

  const processAndDisplayTrends = (historyData, daysBackParam) => {
    const effectiveDaysBack = daysBackParam ?? daysBack;

    // Group all city entries by itemId first
    const grouped = new Map();
    for (const entry of historyData) {
      const itemId = entry?.item_id;
      if (!itemId) continue;
      if (!grouped.has(itemId)) grouped.set(itemId, []);
      grouped.get(itemId).push(entry);
    }

    const trendsList = [];

    for (const [itemId, entries] of grouped.entries()) {
      const trend = calculateTrend(entries, effectiveDaysBack);
      if (trend) {
        trendsList.push({ itemId, ...trend });
      }
    }

    // Sort by absolute change % (biggest trends first)
    trendsList.sort(
      (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
    );

    console.log("Market Trends Debug:", {
      totalDataPoints: historyData.length,
      trendsFound: trendsList.length,
      topTrends: trendsList.slice(0, 5),
    });

    setTrends(trendsList.slice(0, 50)); // Top 50 trends
  };

  const handleRefresh = () => {
    localStorage.removeItem(cacheKey);
    setTrends([]); // Clear before refresh
    loadMarketTrends(null); // Pass null for manual refresh
  };

  return (
    <div className="fantasy-market-trends">
      <div className="fantasy-card">
        <div className="fantasy-header">
          <div className="fantasy-title-wrap">
            <div className="fantasy-badge">📈</div>
            <div>
              <h2>{getUiText("marketTrendsTitle", language)}</h2>
              <p className="fantasy-subtitle">
                {getUiText("marketTrendsIntro", language)}
              </p>
            </div>
          </div>
        </div>

        <div className="fantasy-section">
          <div className="fantasy-control-group fantasy-row">
            <div className="fantasy-control-group-item">
              <label>{getUiText("marketTrendsTimeframe", language)}</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
              >
                <option value="7d">
                  {getUiText("marketTrends7d", language)}
                </option>
                <option value="30d">
                  {getUiText("marketTrends30d", language)}
                </option>
              </select>
            </div>

            <button
              className="fantasy-btn"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading
                ? getUiText("marketTrendsRefreshing", language)
                : getUiText("marketTrendsRefresh", language)}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="fantasy-section">
          <p>{getUiText("marketTrendsLoading", language)}</p>
        </div>
      )}

      {error && (
        <div className="fantasy-section fantasy-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && trends.length === 0 && !error && (
        <div className="fantasy-section">
          <p>{getUiText("marketTrendsNoData", language)}</p>
        </div>
      )}

      {!loading && trends.length > 0 && (
        <div className="fantasy-section">
          <table className="fantasy-table">
            <thead>
              <tr>
                <th>{getUiText("item", language)}</th>
                <th>{getUiText("marketTrendsPriceStart", language)}</th>
                <th>{getUiText("marketTrendsPriceEnd", language)}</th>
                <th>{getUiText("marketTrendsChange", language)}</th>
                <th>{getUiText("marketTrendsChangePercent", language)}</th>
                <th style={{ textAlign: "center" }}>Chart</th>
                <th>{getUiText("marketTrendsBestCity", language)}</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((trend) => (
                <tr
                  key={trend.itemId}
                  className={
                    trend.isUp ? "fantasy-trend-up" : "fantasy-trend-down"
                  }
                >
                  <td className="fantasy-item-name">
                    {getItemDisplayLabel(trend.itemId, itemNameLookup)}
                  </td>
                  <td className="fantasy-price">
                    {trend.oldestPrice.toLocaleString()}
                  </td>
                  <td className="fantasy-price">
                    {trend.latestPrice.toLocaleString()}
                  </td>
                  <td
                    className={
                      trend.isUp ? "fantasy-positive" : "fantasy-negative"
                    }
                  >
                    {trend.change > 0 ? "+" : ""}
                    {trend.change.toLocaleString()}
                  </td>
                  <td
                    className={
                      trend.isUp ? "fantasy-positive" : "fantasy-negative"
                    }
                  >
                    {trend.changePercent > 0 ? "↑" : "↓"}{" "}
                    {Math.abs(trend.changePercent).toFixed(2)}%
                  </td>
                  <td style={{ textAlign: "center", padding: "4px 8px" }}>
                    {trend.priceHistory && trend.priceHistory.length > 1 ? (
                      <MiniSparkline prices={trend.priceHistory} />
                    ) : (
                      <span style={{ fontSize: "0.8em", opacity: 0.5 }}>—</span>
                    )}
                  </td>
                  <td className="fantasy-price">
                    <div>{trend.bestCity}</div>
                    <div style={{ fontSize: "0.9em", opacity: 0.8 }}>
                      {trend.bestPrice.toLocaleString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .fantasy-trend-up {
          background: rgba(0, 255, 0, 0.05);
        }

        .fantasy-trend-down {
          background: rgba(255, 0, 0, 0.05);
        }

        .fantasy-positive {
          color: #00ff00;
          font-weight: bold;
        }

        .fantasy-negative {
          color: #ff6b6b;
          font-weight: bold;
        }

        .fantasy-trend-icon {
          text-align: center;
          font-size: 1.2em;
        }
      `}</style>
    </div>
  );
}
