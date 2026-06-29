import { useEffect, useState } from "react";
import { getItemDisplayLabel } from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { fetchItemsPricesBatch } from "../shared/marketApi";

const LOCATION_MAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const LOCATION_MAP_CACHE_STORAGE_KEY = "albion.locationArbitrageMap.v1";
const TOP_ITEMS_LIMIT = 50;
const BATCH_SIZE = 80;
const MAX_SUSPICIOUS_MARGIN_PERCENT = 500; // Filter out spreads resulting in > 500% margin

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

function normalizeMapIds(itemsIndex) {
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

export default function LocationArbitrageMap({ language, region }) {
  const { itemsIndex, itemNameLookup } = useItemsData(language);
  const [mapData, setMapData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("spread"); // "spread" or "maxSpread"

  const cacheKey = `${LOCATION_MAP_CACHE_STORAGE_KEY}.${region}`;

  useEffect(() => {
    if (!itemsIndex || itemsIndex.length === 0) return;
    loadLocationMapData();
  }, [itemsIndex, region, language]);

  const loadLocationMapData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < LOCATION_MAP_CACHE_TTL_MS) {
          processAndDisplayMap(data);
          setLoading(false);
          return;
        }
      }

      // Fetch top items
      const itemIds = normalizeMapIds(itemsIndex);
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

      processAndDisplayMap(allPriceData);
    } catch (err) {
      setError("Error loading location map data: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const processAndDisplayMap = (priceData) => {
    // Group prices by item and city
    const pricesByItemAndCity = new Map();

    for (const entry of priceData) {
      const itemId = entry?.item_id;
      const city = getCityName(entry);
      if (!itemId || !city) continue;

      const key = itemId;
      if (!pricesByItemAndCity.has(key)) {
        pricesByItemAndCity.set(key, new Map());
      }

      const cityData = pricesByItemAndCity.get(key);
      if (!cityData.has(city)) {
        cityData.set(city, {
          city,
          sell: getSellPrice(entry),
          buy: getBuyPrice(entry),
        });
      }
    }

    // Build map data
    const mapItems = [];

    for (const [itemId, cityPrices] of pricesByItemAndCity) {
      if (cityPrices.size === 0) continue;

      // Find price spreads
      const cityArray = Array.from(cityPrices.values());

      // Sell price spread (difference between highest and lowest sell)
      let maxSellPrice = 0;
      let minSellPrice = Infinity;
      let maxSellCity = null;
      let minSellCity = null;

      for (const cp of cityArray) {
        if (cp.sell > maxSellPrice) {
          maxSellPrice = cp.sell;
          maxSellCity = cp.city;
        }
        if (cp.sell > 0 && cp.sell < minSellPrice) {
          minSellPrice = cp.sell;
          minSellCity = cp.city;
        }
      }

      // Buy price spread (difference between highest and lowest buy)
      let maxBuyPrice = 0;
      let minBuyPrice = Infinity;
      let maxBuyCity = null;
      let minBuyCity = null;

      for (const cp of cityArray) {
        if (cp.buy > maxBuyPrice) {
          maxBuyPrice = cp.buy;
          maxBuyCity = cp.city;
        }
        if (cp.buy > 0 && cp.buy < minBuyPrice) {
          minBuyPrice = cp.buy;
          minBuyCity = cp.city;
        }
      }

      const sellSpread =
        maxSellPrice > 0 && minSellPrice < Infinity
          ? maxSellPrice - minSellPrice
          : 0;
      const buySpread =
        maxBuyPrice > 0 && minBuyPrice < Infinity
          ? maxBuyPrice - minBuyPrice
          : 0;
      const maxSpread = Math.max(sellSpread, buySpread);

      // Calculate margin to filter out suspicious data
      // Sell spread margin: (maxSell - minSell) / minSell * 100
      const sellMargin =
        minSellPrice > 0 ? (sellSpread / minSellPrice) * 100 : 0;
      // Buy spread margin: (maxBuy - minBuy) / minBuy * 100
      const buyMargin = minBuyPrice > 0 ? (buySpread / minBuyPrice) * 100 : 0;

      // Skip if any margin is suspiciously high (likely data error)
      if (
        maxSpread > 0 &&
        sellMargin <= MAX_SUSPICIOUS_MARGIN_PERCENT &&
        buyMargin <= MAX_SUSPICIOUS_MARGIN_PERCENT
      ) {
        mapItems.push({
          itemId,
          cityPrices: cityArray,
          sellSpread,
          sellLowest: minSellPrice < Infinity ? minSellPrice : 0,
          sellLowestCity: minSellCity,
          sellHighest: maxSellPrice,
          sellHighestCity: maxSellCity,
          buySpread,
          buyLowest: minBuyPrice < Infinity ? minBuyPrice : 0,
          buyLowestCity: minBuyCity,
          buyHighest: maxBuyPrice,
          buyHighestCity: maxBuyCity,
          maxSpread,
        });
      }
    }

    // Sort
    if (sortBy === "spread") {
      mapItems.sort((a, b) => b.sellSpread - a.sellSpread);
    } else if (sortBy === "maxSpread") {
      mapItems.sort((a, b) => b.maxSpread - a.maxSpread);
    }

    setMapData(mapItems);
  };

  const handleRefresh = () => {
    localStorage.removeItem(cacheKey);
    loadLocationMapData();
  };

  return (
    <div className="fantasy-location-map">
      <div className="fantasy-section">
        <h1>{getUiText("locationMapTitle", language)}</h1>
        <p className="fantasy-intro">
          {getUiText("locationMapIntro", language)}
        </p>

        <div className="fantasy-control-group fantasy-row">
          <div>
            <label>{getUiText("locationMapSortBy", language)}</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="spread">
                {getUiText("locationMapSortSell", language)}
              </option>
              <option value="maxSpread">
                {getUiText("locationMapSortMax", language)}
              </option>
            </select>
          </div>

          <button
            className="fantasy-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading
              ? getUiText("locationMapRefreshing", language)
              : getUiText("locationMapRefresh", language)}
          </button>
        </div>
      </div>

      {loading && (
        <div className="fantasy-section">
          <p>{getUiText("locationMapLoading", language)}</p>
        </div>
      )}

      {error && (
        <div className="fantasy-section fantasy-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && mapData.length === 0 && !error && (
        <div className="fantasy-section">
          <p>{getUiText("locationMapNoData", language)}</p>
        </div>
      )}

      {!loading && mapData.length > 0 && (
        <div className="fantasy-section">
          <div className="fantasy-location-map-grid">
            {mapData.map((item) => (
              <div key={item.itemId} className="fantasy-location-map-card">
                <h3>{getItemDisplayLabel(item.itemId, itemNameLookup)}</h3>

                <div className="fantasy-map-column">
                  <h4>{getUiText("locationMapSellPrices", language)}</h4>
                  <table className="fantasy-table-compact">
                    <thead>
                      <tr>
                        <th>{getUiText("city", language)}</th>
                        <th>{getUiText("price", language)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.cityPrices
                        .sort((a, b) => b.sell - a.sell)
                        .map((cp) => (
                          <tr
                            key={cp.city}
                            className={
                              cp.sell === item.sellHighest
                                ? "fantasy-best-price"
                                : cp.sell === item.sellLowest && cp.sell > 0
                                  ? "fantasy-worst-price"
                                  : ""
                            }
                          >
                            <td>{cp.city}</td>
                            <td className="fantasy-price">
                              {cp.sell > 0 ? cp.sell.toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {item.sellSpread > 0 && (
                    <div className="fantasy-spread-info">
                      <strong>
                        {getUiText("locationMapSpread", language)}:
                      </strong>
                      <span>{item.sellSpread.toLocaleString()}</span>
                      <br />
                      <small>
                        {item.sellHighestCity} → {item.sellLowestCity}
                      </small>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        .fantasy-location-map-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .fantasy-location-map-card {
          border: 1px solid #8b7355;
          border-radius: 4px;
          padding: 16px;
          background: rgba(139, 115, 85, 0.1);
        }

        .fantasy-location-map-card h3 {
          margin: 0 0 12px 0;
          color: #d4af37;
          font-size: 1.2em;
        }

        .fantasy-location-map-card h4 {
          margin: 0 0 8px 0;
          color: #b8941f;
          font-size: 0.95em;
        }

        .fantasy-map-column {
          display: flex;
          flex-direction: column;
        }

        .fantasy-table-compact {
          width: 100%;
          font-size: 0.9em;
          margin-bottom: 8px;
        }

        .fantasy-table-compact th,
        .fantasy-table-compact td {
          padding: 6px 8px;
          text-align: right;
          border-bottom: 1px solid #5a4a3a;
        }

        .fantasy-table-compact th {
          text-align: left;
        }

        .fantasy-table-compact tr.fantasy-best-price {
          background: rgba(0, 255, 0, 0.1);
        }

        .fantasy-table-compact tr.fantasy-worst-price {
          background: rgba(255, 0, 0, 0.1);
        }

        .fantasy-spread-info {
          padding: 8px;
          background: rgba(212, 175, 55, 0.1);
          border-radius: 2px;
          font-size: 0.85em;
          color: #d4af37;
        }

        .fantasy-spread-info strong {
          display: block;
          margin-bottom: 4px;
        }

        .fantasy-spread-info span {
          color: #ffd700;
          font-weight: bold;
        }

        .fantasy-spread-info small {
          display: block;
          margin-top: 4px;
          color: #a99d7d;
        }

        @media (max-width: 1200px) {
          .fantasy-location-map-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .fantasy-location-map-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
