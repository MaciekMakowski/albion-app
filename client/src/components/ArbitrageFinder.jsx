import { useEffect, useState } from "react";
import { getItemDisplayLabel } from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { getCityColor, MARKET_CITIES } from "../shared/cities";
import { fetchItemsPricesBatch } from "../shared/marketApi";
import ItemIcon from "./ItemIcon";

const ARBITRAGE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ARBITRAGE_CACHE_STORAGE_KEY = "albion.arbitrageFinder.v1";
const TOP_ITEMS_LIMIT = 200;
const BATCH_SIZE = 80;
const MAX_SUSPICIOUS_MARGIN_PERCENT = 500; // Filter out margins > 500%

const cityOptions = MARKET_CITIES;

function CityDotLabel({ city }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: getCityColor(city),
          border: "1px solid rgba(255, 255, 255, 0.35)",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.25)",
        }}
      />
      {city}
    </span>
  );
}

function getCityName(entry) {
  return entry.location || entry.city || entry.name || "";
}

function getSellPrice(entry) {
  return entry.sell_price_min || entry.sell_price || entry.price || 0;
}

function getBuyPrice(entry) {
  return entry.buy_price_max || entry.buy_price || 0;
}

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function normalizeArbitrageIds(itemsIndex) {
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

export default function ArbitrageFinder({ language, region }) {
  const { itemsIndex, itemNameLookup } = useItemsData(language);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("profit"); // "profit" or "margin"
  const [minProfit, setMinProfit] = useState(10000);

  const cacheKey = `${ARBITRAGE_CACHE_STORAGE_KEY}.${region}`;

  useEffect(() => {
    if (!itemsIndex || itemsIndex.length === 0) return;
    loadArbitrageData();
  }, [itemsIndex, region, language]);

  const loadArbitrageData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < ARBITRAGE_CACHE_TTL_MS) {
          processAndDisplayOpportunities(data);
          setLoading(false);
          return;
        }
      }

      // Fetch top items
      const itemIds = normalizeArbitrageIds(itemsIndex);
      if (itemIds.length === 0) {
        setError("No items to analyze");
        setLoading(false);
        return;
      }

      // Batch fetch prices for all items across all cities
      const chunks = chunkArray(itemIds, BATCH_SIZE);
      let allPriceData = [];

      for (const chunk of chunks) {
        try {
          const prices = await fetchItemsPricesBatch(
            chunk,
            region,
            cityOptions,
          );
          allPriceData = allPriceData.concat(prices || []);
        } catch (err) {
          console.warn("Error fetching prices batch:", err);
        }
      }

      // Cache the results
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: allPriceData,
          timestamp: Date.now(),
        }),
      );

      processAndDisplayOpportunities(allPriceData);
    } catch (err) {
      setError("Error loading arbitrage data: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const processAndDisplayOpportunities = (priceData) => {
    // Group prices by item
    const pricesByItem = new Map();

    for (const entry of priceData) {
      const itemId = entry?.item_id;
      const city = getCityName(entry);
      if (!itemId || !city) continue;

      if (!pricesByItem.has(itemId)) {
        pricesByItem.set(itemId, []);
      }
      pricesByItem.get(itemId).push({
        city,
        buy: getBuyPrice(entry),
        sell: getSellPrice(entry),
      });
    }

    // Calculate arbitrage opportunities
    const opps = [];

    for (const [itemId, prices] of pricesByItem) {
      // Find best sell price (max sell_price_min)
      let bestSellCity = null;
      let bestSellPrice = 0;
      for (const p of prices) {
        if (p.sell > bestSellPrice) {
          bestSellPrice = p.sell;
          bestSellCity = p.city;
        }
      }

      // Find best buy price (min buy_price_max)
      let bestBuyCity = null;
      let bestBuyPrice = Infinity;
      for (const p of prices) {
        if (p.buy > 0 && p.buy < bestBuyPrice) {
          bestBuyPrice = p.buy;
          bestBuyCity = p.city;
        }
      }

      // Only consider if we have both buy and sell opportunities
      if (
        bestSellPrice > 0 &&
        bestBuyCity &&
        bestBuyPrice < Infinity &&
        bestSellCity !== bestBuyCity
      ) {
        const profit = bestSellPrice - bestBuyPrice;
        const margin = bestBuyPrice > 0 ? (profit / bestBuyPrice) * 100 : 0;

        opps.push({
          itemId,
          bestBuyCity,
          bestBuyPrice: Math.floor(bestBuyPrice),
          bestSellCity,
          bestSellPrice: Math.floor(bestSellPrice),
          profit: Math.floor(profit),
          margin: Math.round(margin * 100) / 100,
        });
      }
    }

    // Filter by min profit
    const filtered = opps.filter(
      (opp) =>
        opp.profit >= minProfit && opp.margin <= MAX_SUSPICIOUS_MARGIN_PERCENT,
    );

    // Sort
    if (sortBy === "profit") {
      filtered.sort((a, b) => b.profit - a.profit);
    } else if (sortBy === "margin") {
      filtered.sort((a, b) => b.margin - a.margin);
    }

    setOpportunities(filtered);
  };

  const handleRefresh = () => {
    localStorage.removeItem(cacheKey);
    loadArbitrageData();
  };

  return (
    <div className="fantasy-arbitrage-finder">
      <div className="fantasy-card">
        <div className="fantasy-header">
          <div className="fantasy-title-wrap">
            <div className="fantasy-badge">⚙️</div>
            <div>
              <h2>{getUiText("arbitrageFinderTitle", language)}</h2>
              <p className="fantasy-subtitle">
                {getUiText("arbitrageFinderIntro", language)}
              </p>
            </div>
          </div>
        </div>

        <div className="fantasy-section">
          <div className="fantasy-control-group fantasy-row">
            <div className="fantasy-control-group-item">
              <label>{getUiText("arbitrageMinProfit", language)}</label>
              <input
                type="number"
                value={minProfit}
                onChange={(e) =>
                  setMinProfit(Math.max(0, Number(e.target.value)))
                }
                min="0"
                step="1000"
              />
            </div>

            <div className="fantasy-control-group-item">
              <label>{getUiText("arbitrageSortBy", language)}</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="profit">
                  {getUiText("arbitrageSortProfit", language)}
                </option>
                <option value="margin">
                  {getUiText("arbitrageSortMargin", language)}
                </option>
              </select>
            </div>

            <button
              className="fantasy-btn"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading
                ? getUiText("arbitrageRefreshing", language)
                : getUiText("arbitrageRefresh", language)}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="fantasy-section">
          <p>{getUiText("arbitrageLoading", language)}</p>
        </div>
      )}

      {error && (
        <div className="fantasy-section fantasy-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && opportunities.length === 0 && !error && (
        <div className="fantasy-section">
          <p>{getUiText("arbitrageNoData", language)}</p>
        </div>
      )}

      {!loading && opportunities.length > 0 && (
        <div className="fantasy-section">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {opportunities.map((opp) => (
              <div
                key={opp.itemId}
                style={{
                  border: "1px solid rgba(247, 184, 75, 0.2)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255, 255, 255, 0.03)",
                }}
              >
                <div
                  className="fantasy-item-name"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#ffe7a8",
                    marginBottom: 10,
                  }}
                >
                  <ItemIcon itemId={opp.itemId} size={20} />
                  <span>{getItemDisplayLabel(opp.itemId, itemNameLookup)}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "6px 10px",
                    alignItems: "center",
                    fontSize: "0.9rem",
                  }}
                >
                  <span style={{ color: "#d4b162" }}>
                    {getUiText("arbitrageBuyCity", language)}
                  </span>
                  <span style={{ color: "#f7e4b1" }}>
                    <CityDotLabel city={opp.bestBuyCity} />
                  </span>

                  <span style={{ color: "#d4b162" }}>
                    {getUiText("arbitrageBuyPrice", language)}
                  </span>
                  <span className="fantasy-price" style={{ color: "#f7e4b1" }}>
                    {opp.bestBuyPrice.toLocaleString()}
                  </span>

                  <span style={{ color: "#d4b162" }}>
                    {getUiText("arbitrageSellCity", language)}
                  </span>
                  <span style={{ color: "#f7e4b1" }}>
                    <CityDotLabel city={opp.bestSellCity} />
                  </span>

                  <span style={{ color: "#d4b162" }}>
                    {getUiText("arbitrageSellPrice", language)}
                  </span>
                  <span className="fantasy-price" style={{ color: "#f7e4b1" }}>
                    {opp.bestSellPrice.toLocaleString()}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(247, 184, 75, 0.14)",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      background: "rgba(34, 197, 94, 0.12)",
                      border: "1px solid rgba(34, 197, 94, 0.35)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "#b8eec9" }}>
                      {getUiText("arbitrageProfit", language)}
                    </div>
                    <div className="fantasy-profit" style={{ fontWeight: 700 }}>
                      {opp.profit.toLocaleString()}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "#b9d8ff" }}>
                      {getUiText("arbitrageProfitPercent", language)}
                    </div>
                    <div className="fantasy-margin" style={{ fontWeight: 700 }}>
                      {opp.margin.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
