import { useEffect, useState } from "react";
import { getItemDisplayLabel } from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { fetchItemsPricesBatch } from "../shared/marketApi";

const ARBITRAGE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ARBITRAGE_CACHE_STORAGE_KEY = "albion.arbitrageFinder.v1";
const TOP_ITEMS_LIMIT = 200;
const BATCH_SIZE = 80;
const MAX_SUSPICIOUS_MARGIN_PERCENT = 500; // Filter out margins > 500%

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
          <table className="fantasy-table">
            <thead>
              <tr>
                <th>{getUiText("item", language)}</th>
                <th>{getUiText("arbitrageBuyCity", language)}</th>
                <th>{getUiText("arbitrageBuyPrice", language)}</th>
                <th>{getUiText("arbitrageSellCity", language)}</th>
                <th>{getUiText("arbitrageSellPrice", language)}</th>
                <th>{getUiText("arbitrageProfit", language)}</th>
                <th>{getUiText("arbitrageProfitPercent", language)}</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => (
                <tr key={opp.itemId}>
                  <td className="fantasy-item-name">
                    {getItemDisplayLabel(opp.itemId, itemNameLookup)}
                  </td>
                  <td>{opp.bestBuyCity}</td>
                  <td className="fantasy-price">
                    {opp.bestBuyPrice.toLocaleString()}
                  </td>
                  <td>{opp.bestSellCity}</td>
                  <td className="fantasy-price">
                    {opp.bestSellPrice.toLocaleString()}
                  </td>
                  <td className="fantasy-profit">
                    {opp.profit.toLocaleString()}
                  </td>
                  <td className="fantasy-margin">{opp.margin.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
